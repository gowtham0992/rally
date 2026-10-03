import {assertWorkspaceScope} from '../demo/scope.ts';
import {randomUUID} from 'node:crypto';
import type pg from 'pg';
import {z} from 'zod';
import {transaction} from '../db.ts';
import {fingerprint,DomainError} from '../payments/types.ts';
import type {IntakeActor} from '../intake/service.ts';
import {confirmedPlan} from '../planning/persisted.ts';
import {catalogSchema,type Candidate} from '../planning/domain.ts';
const uuid=z.uuid(),key=z.string().min(1).max(100);
const requestSchema=z.strictObject({commandId:uuid,groupId:uuid,expectedRevision:z.number().int().nonnegative(),offeringId:key,slotId:key});
const approveSchema=z.strictObject({commandId:uuid,requestId:uuid,expectedRevision:z.number().int().nonnegative(),
 factsConfirmed:z.literal(true),externalCalendarBlocked:z.literal(true),automaticSettlementAgreed:z.literal(true),collectionArrangementsAgreed:z.literal(true)});
const reopenSchema=z.strictObject({commandId:uuid,groupId:uuid,offerId:uuid,expectedRevision:z.number().int().nonnegative(),offerHash:z.string().length(64),acknowledgesNewApprovals:z.literal(true)});
const checkPaymentSchema=z.strictObject({commandId:uuid,offerId:uuid,operationId:uuid});
const evidenceSchema=z.strictObject({commandId:uuid,operationId:uuid,
 expectedOperationState:z.enum(['UNKNOWN','PENDING','ACTION_REQUIRED','FAILED']),
 source:z.enum(['TRANSACTION','SUPPORT_CASE']),reference:z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9-]{2,63}$/),
 reportedOutcome:z.enum(['COMPLETED','PENDING','FAILED','UNRESOLVED'])});
const canRecordEvidence=(op:{state:string;kind:string;dispatched_at:unknown})=>Boolean(op.dispatched_at)&&
 (['UNKNOWN','PENDING','ACTION_REQUIRED'].includes(op.state)||op.state==='FAILED'&&['VOID','REFUND'].includes(op.kind));
const closedBookings=new Set(['EXPIRED','WITHDRAWN','SUPERSEDED','ABORTED','CANCELED']);
const candidateSchema=z.strictObject({catalogVersionId:key,studioId:key,studioName:z.string().min(1).max(100),offeringId:key,activity:z.string().min(1).max(100),slotId:key,
 startAt:z.iso.datetime(),endAt:z.iso.datetime(),timezone:key,amountMinor:z.number().int().min(1).max(1000000),currency:z.literal('USD'),groupSize:z.number().int().min(1).max(8),
 collectionDescription:z.string().min(1).max(300),cancellationTerms:z.string().min(1).max(1000),synthetic:z.boolean()});
const snapshotSchema=z.strictObject({schemaVersion:z.literal(1),offerId:uuid,groupId:uuid,planningRevision:z.number().int().nonnegative(),sourceHash:z.string().length(64),
 candidate:candidateSchema,roster:z.array(z.strictObject({memberId:uuid,displayName:z.string().min(1).max(60)})).min(1).max(8),
 collectionArrangements:z.array(z.strictObject({ownerMemberId:uuid,ownerName:z.string().min(1).max(60),nomineeMemberId:uuid,nomineeName:z.string().min(1).max(60)})).max(8),
 merchantId:z.string().min(1).max(127),openedAt:z.iso.datetime(),deadline:z.iso.datetime(),reservationEnd:z.iso.datetime(),
 reservation:z.strictObject({resourceId:z.string().min(1).max(127),occupiedStart:z.iso.datetime(),occupiedEnd:z.iso.datetime()}),
 policy:z.strictObject({individualAuthorizations:z.literal(true),separateNonAtomicPayments:z.literal(true),automaticSettlement:z.literal(true),
 confirmationRequiresEveryPayment:z.literal(true),externalCalendarAttested:z.literal(true)})});
export type OfferSnapshot=z.infer<typeof snapshotSchema>;
export class BookingService {
 constructor(private pool:pg.Pool){}
 private actor(a:IntakeActor){uuid.parse(a.userId);if(a.demoWorkspaceId)uuid.parse(a.demoWorkspaceId);if(a.emailVerified!==true)throw new DomainError('VERIFIED_IDENTITY_REQUIRED',401);}
 private async command<T>(actor:IntakeActor,id:string,payload:unknown,fn:(c:pg.PoolClient)=>Promise<T>):Promise<T>{
  this.actor(actor);return transaction(this.pool,async c=>{
   await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[id]);
   const hash=fingerprint(actor.demoWorkspaceId?{workspaceId:actor.demoWorkspaceId,payload}:payload),prior=(await c.query('SELECT actor_id,fingerprint,result FROM intake_commands WHERE id=$1',[id])).rows[0];
   if(prior){if(prior.actor_id!==actor.userId||prior.fingerprint!==hash)throw new DomainError('COMMAND_CONFLICT');return prior.result as T;}
   const result=await fn(c);await c.query('INSERT INTO intake_commands VALUES($1,$2,$3,$4)',[id,actor.userId,hash,JSON.stringify(result)]);return result;
  });
 }
 private async group(c:pg.PoolClient,id:string,actor:IntakeActor){const g=(await c.query('SELECT * FROM planning_groups WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!g)throw new DomainError('NOT_FOUND',404);assertWorkspaceScope(actor,g);return g;}
 private selected(plan:Awaited<ReturnType<typeof confirmedPlan>>,offeringId:string,slotId:string):Candidate{
  if(plan.result.state!=='CANDIDATE_READY')throw new DomainError('NO_VALID_CANDIDATE',422);
  const candidate=plan.result.candidates.find(c=>c.offeringId===offeringId&&c.slotId===slotId);if(!candidate)throw new DomainError('NO_VALID_CANDIDATE',422);return candidate;
 }
 async request(actor:IntakeActor,value:unknown){const p=requestSchema.parse(value);return this.command(actor,p.commandId,{kind:'REQUEST_OFFER',...p},async c=>{
  const g=await this.group(c,p.groupId,actor);if(g.organizer_id!==actor.userId)throw new DomainError('NOT_FOUND',404);
  if(g.state!=='CLOSED'||g.revision!==p.expectedRevision)throw new DomainError('STALE_PLANNING');
  await this.recovered(c,g.id);
  const plan=await confirmedPlan(c,g.id,g.catalog),candidate=this.selected(plan,p.offeringId,p.slotId);
  if(plan.rows.length!==g.target_size)throw new DomainError('INVALID_ROSTER');
  const published=(await c.query('SELECT catalog FROM merchant_catalog_versions WHERE studio_id=$1 AND version_id=$2',[plan.catalog.studioId,plan.catalog.versionId])).rows[0];
  if(!published||fingerprint(catalogSchema.parse(published.catalog))!==fingerprint(plan.catalog))throw new DomainError('UNVERIFIED_CATALOG',422);
  const requestId=randomUUID(),revision=g.revision+1;
  await c.query('INSERT INTO merchant_requests(id,group_id,planning_revision,studio_id,catalog_version_id,offering_id,slot_id,source_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
   [requestId,g.id,revision,candidate.studioId,candidate.catalogVersionId,p.offeringId,p.slotId,plan.sourceHash]);
  await c.query("UPDATE planning_groups SET state='MERCHANT_REVIEW',revision=$2,candidate=NULL WHERE id=$1",[g.id,revision]);
  await c.query("INSERT INTO planning_events(group_id,revision,kind) VALUES($1,$2,'MERCHANT_REVIEW_REQUESTED')",[g.id,revision]);return {requestId,revision};
 });}
 private async recovered(c:pg.PoolClient,groupId:string){
  const prior=(await c.query('SELECT o.id,o.state,o.cleanup FROM offers o JOIN offer_snapshots os ON os.offer_id=o.id WHERE os.group_id=$1 FOR UPDATE OF o',[groupId])).rows;
  if(prior.some(o=>!closedBookings.has(o.state)||o.cleanup!=='COMPLETE'))throw new DomainError('PAYMENT_RECOVERY_REQUIRED');
  const unresolved=await c.query(`SELECT 1 FROM payment_operations p JOIN offer_snapshots os ON os.offer_id=p.offer_id
   WHERE os.group_id=$1 AND p.kind IN ('AUTHORIZE','CAPTURE','VOID','REFUND')
   AND p.state IN ('PLANNED','DISPATCHED','UNKNOWN','PENDING','ACTION_REQUIRED') LIMIT 1`,[groupId]);
  if(unresolved.rowCount)throw new DomainError('PAYMENT_RECOVERY_REQUIRED');
 }
 async reopen(actor:IntakeActor,value:unknown){const p=reopenSchema.parse(value);return this.command(actor,p.commandId,{kind:'REOPEN_PLANNING',...p},async c=>{
  const g=await this.group(c,p.groupId,actor);if(g.organizer_id!==actor.userId)throw new DomainError('NOT_FOUND',404);
  if(g.state!=='OFFER_ISSUED'||g.revision!==p.expectedRevision)throw new DomainError('STALE_PLANNING');
  const latest=(await c.query(`SELECT o.id,o.offer_hash FROM merchant_requests r JOIN offers o ON o.id=r.approved_offer_id
   WHERE r.group_id=$1 AND r.state='APPROVED' ORDER BY r.planning_revision DESC LIMIT 1`,[g.id])).rows[0];
  if(!latest||latest.id!==p.offerId||latest.offer_hash!==p.offerHash)throw new DomainError('STALE_OFFER');
  await this.recovered(c,g.id);
  await c.query("UPDATE planning_groups SET state='CLOSED',revision=revision+1,candidate=NULL WHERE id=$1",[g.id]);
  await c.query("INSERT INTO planning_events(group_id,revision,kind) VALUES($1,$2,'PLANNING_REOPENED')",[g.id,g.revision+1]);
  return {groupId:g.id as string,revision:g.revision+1};
 });}
 async approve(actor:IntakeActor,value:unknown){const p=approveSchema.parse(value);
  try{return await this.command(actor,p.commandId,{kind:'APPROVE_OFFER',...p},async c=>{
   const request=(await c.query('SELECT r.*,s.owner_user_id,s.paypal_merchant_id,s.resource_id,s.setup_minutes,s.cleanup_minutes FROM merchant_requests r JOIN merchant_studios s ON s.studio_id=r.studio_id WHERE r.id=$1',[p.requestId])).rows[0];
   if(!request||request.owner_user_id!==actor.userId)throw new DomainError('NOT_FOUND',404);
   const g=await this.group(c,request.group_id,actor);
   if(g.state!=='MERCHANT_REVIEW'||g.revision!==p.expectedRevision||request.planning_revision!==g.revision||request.state!=='PENDING')throw new DomainError('STALE_PLANNING');
   const plan=await confirmedPlan(c,g.id,g.catalog),candidate=this.selected(plan,request.offering_id,request.slot_id);
   if(plan.sourceHash!==request.source_hash||plan.rows.length!==g.target_size)throw new DomainError('STALE_PLANNING');
   // Serialize approval of this studio's exclusive resource; the database exclusion
   // constraint remains the backstop against any other inserting code path.
   await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,1))',[request.resource_id]);
   const now:Date=(await c.query('SELECT clock_timestamp() AS time')).rows[0].time;
   const deadline=new Date(now.getTime()+2*60*60*1000),reservationEnd=new Date(deadline.getTime()+30*60*1000);
   if(Date.parse(candidate.startAt)<reservationEnd.getTime()+24*60*60*1000)throw new DomainError('SESSION_TOO_SOON',422);
   const occupiedStart=new Date(Date.parse(candidate.startAt)-request.setup_minutes*60000).toISOString();
   const occupiedEnd=new Date(Date.parse(candidate.endAt)+request.cleanup_minutes*60000).toISOString();
   const offerId=randomUUID();
   const snapshot=snapshotSchema.parse({schemaVersion:1,offerId,groupId:g.id,planningRevision:g.revision,sourceHash:plan.sourceHash,candidate,
    roster:plan.rows.map(r=>({memberId:r.id,displayName:r.display_name})),
    collectionArrangements:plan.preferences.filter(pref=>pref.collection==='NOMINEE_LATER').map(pref=>({ownerMemberId:pref.memberId,
     ownerName:plan.rows.find(r=>r.id===pref.memberId)!.display_name,nomineeMemberId:pref.nomineeMemberId!,nomineeName:plan.rows.find(r=>r.id===pref.nomineeMemberId)!.display_name})),
    merchantId:request.paypal_merchant_id,openedAt:now.toISOString(),deadline:deadline.toISOString(),reservationEnd:reservationEnd.toISOString(),
    reservation:{resourceId:request.resource_id,occupiedStart,occupiedEnd},
    policy:{individualAuthorizations:true,separateNonAtomicPayments:true,automaticSettlement:true,confirmationRequiresEveryPayment:true,externalCalendarAttested:true}});
   const hash=fingerprint(snapshot);
   await c.query("INSERT INTO offers(id,merchant_id,offer_hash,amount_minor,state,opened_at,deadline,reservation_end) VALUES($1,$2,$3,$4,'OPEN',$5,$6,$7)",[offerId,request.paypal_merchant_id,hash,candidate.amountMinor,now,deadline,reservationEnd]);
   await c.query("INSERT INTO reservations(offer_id,resource_id,occupied,state) VALUES($1,$2,tstzrange($3::timestamptz,$4::timestamptz,'[)'),'HELD')",[offerId,request.resource_id,occupiedStart,occupiedEnd]);
   for(const [ordinal,member] of plan.rows.entries())await c.query('INSERT INTO offer_members(id,offer_id,user_id,ordinal) VALUES($1,$2,$3,$4)',[randomUUID(),offerId,member.user_id,ordinal]);
   await c.query('INSERT INTO offer_snapshots(offer_id,request_id,group_id,snapshot) VALUES($1,$2,$3,$4)',[offerId,request.id,g.id,JSON.stringify(snapshot)]);
   await c.query("UPDATE merchant_requests SET state='APPROVED',approved_offer_id=$2 WHERE id=$1",[request.id,offerId]);
   await c.query("UPDATE planning_groups SET state='OFFER_ISSUED',revision=revision+1,candidate=NULL WHERE id=$1",[g.id]);
   await c.query("INSERT INTO planning_events(group_id,revision,kind) VALUES($1,$2,'OFFER_OPENED')",[g.id,g.revision+1]);
   await c.query("INSERT INTO payment_events(offer_id,event_type,state) VALUES($1,'OFFER_OPENED','OPEN')",[offerId]);
   return {offerId,offerHash:hash,revision:g.revision+1};
  });}catch(error){if((error as {code?:string}).code==='23P01')throw new DomainError('RESERVATION_CONFLICT');throw error;}
 }
 async merchantQueue(actor:IntakeActor,cursor:string|null=null){this.actor(actor);if(cursor)uuid.parse(cursor);
  return transaction(this.pool,async c=>{
   const studios=(await c.query('SELECT studio_id FROM merchant_studios WHERE owner_user_id=$1',[actor.userId])).rows;
   if(!studios.length)throw new DomainError('NOT_FOUND',404);
   let before:{created_at:Date;id:string}|undefined;
   if(cursor){before=(await c.query(`SELECT r.created_at,r.id FROM merchant_requests r JOIN merchant_studios s ON s.studio_id=r.studio_id JOIN planning_groups g ON g.id=r.group_id WHERE r.id=$1 AND s.owner_user_id=$2 AND (to_jsonb(g)->>'demo_workspace_id') IS NOT DISTINCT FROM $3::text`,[cursor,actor.userId,actor.demoWorkspaceId??null])).rows[0];if(!before)throw new DomainError('NOT_FOUND',404);}
   const rows=(await c.query(`SELECT r.id,r.created_at,r.offering_id,r.slot_id,v.catalog,g.target_size
    FROM merchant_requests r JOIN merchant_studios s ON s.studio_id=r.studio_id
    JOIN merchant_catalog_versions v ON v.studio_id=r.studio_id AND v.version_id=r.catalog_version_id
    JOIN planning_groups g ON g.id=r.group_id
    WHERE s.owner_user_id=$1 AND (to_jsonb(g)->>'demo_workspace_id') IS NOT DISTINCT FROM $4::text AND r.state='PENDING' AND g.state='MERCHANT_REVIEW' AND g.revision=r.planning_revision
    AND ($2::timestamptz IS NULL OR (r.created_at,r.id)<($2::timestamptz,$3::uuid))
    ORDER BY r.created_at DESC,r.id DESC LIMIT 21`,[actor.userId,before?.created_at??null,before?.id??null,actor.demoWorkspaceId??null])).rows;
   const requests=rows.slice(0,20).map(r=>{const catalog=catalogSchema.parse(r.catalog),offering=catalog.offerings.find(o=>o.id===r.offering_id),slot=catalog.slots.find(s=>s.id===r.slot_id);
    if(!offering||!slot)throw new DomainError('UNVERIFIED_CATALOG',422);
    return {requestId:r.id as string,studioName:catalog.studioName,activity:offering.name,startAt:slot.startAt,timezone:catalog.timezone,amountMinor:offering.priceMinor,groupSize:r.target_size as number};});
   return {requests,nextCursor:rows.length>20?requests.at(-1)!.requestId:null};
  });
 }
 async merchantBookings(actor:IntakeActor,cursor:string|null=null){this.actor(actor);if(cursor)uuid.parse(cursor);
  return transaction(this.pool,async c=>{
   if(!(await c.query('SELECT 1 FROM merchant_studios WHERE owner_user_id=$1 LIMIT 1',[actor.userId])).rowCount)throw new DomainError('NOT_FOUND',404);
   let before:{opened_at:Date;id:string}|undefined;
   if(cursor){before=(await c.query(`SELECT o.opened_at,o.id FROM offers o JOIN offer_snapshots os ON os.offer_id=o.id
    JOIN merchant_studios s ON s.studio_id=os.snapshot->'candidate'->>'studioId' JOIN planning_groups g ON g.id=os.group_id WHERE o.id=$1 AND s.owner_user_id=$2 AND (to_jsonb(g)->>'demo_workspace_id') IS NOT DISTINCT FROM $3::text`,[cursor,actor.userId,actor.demoWorkspaceId??null])).rows[0];if(!before)throw new DomainError('NOT_FOUND',404);}
   const rows=(await c.query(`SELECT o.id,o.state,o.cleanup,os.snapshot,
    (SELECT count(*)::integer FROM cancellation_requests cr JOIN offer_members m ON m.id=cr.member_id WHERE m.offer_id=o.id) AS requests
    FROM offers o JOIN offer_snapshots os ON os.offer_id=o.id JOIN merchant_studios s ON s.studio_id=os.snapshot->'candidate'->>'studioId' JOIN planning_groups g ON g.id=os.group_id
    WHERE (to_jsonb(g)->>'demo_workspace_id') IS NOT DISTINCT FROM $4::text AND s.owner_user_id=$1 AND ($2::timestamptz IS NULL OR (o.opened_at,o.id)<($2::timestamptz,$3::uuid))
    ORDER BY o.opened_at DESC,o.id DESC LIMIT 21`,[actor.userId,before?.opened_at??null,before?.id??null,actor.demoWorkspaceId??null])).rows;
   const bookings=rows.slice(0,20).map(r=>{const snapshot=snapshotSchema.parse(r.snapshot);return {offerId:r.id as string,booking:r.state as string,cleanup:r.cleanup as string,cancellationRequests:r.requests as number,activity:snapshot.candidate.activity,startAt:snapshot.candidate.startAt,timezone:snapshot.candidate.timezone,groupSize:snapshot.roster.length};});
   return {bookings,nextCursor:rows.length>20?bookings.at(-1)!.offerId:null};
  });
 }
 async merchantExceptions(actor:IntakeActor,cursor:string|null=null){this.actor(actor);if(cursor)uuid.parse(cursor);
  return transaction(this.pool,async c=>{
   if(!(await c.query('SELECT 1 FROM merchant_studios WHERE owner_user_id=$1 LIMIT 1',[actor.userId])).rowCount)throw new DomainError('NOT_FOUND',404);
   let before:{opened_at:Date;id:string}|undefined;
   if(cursor){before=(await c.query(`SELECT o.opened_at,o.id FROM offers o JOIN offer_snapshots os ON os.offer_id=o.id
    JOIN merchant_studios s ON s.studio_id=os.snapshot->'candidate'->>'studioId' JOIN planning_groups g ON g.id=os.group_id
    WHERE o.id=$1 AND s.owner_user_id=$2 AND (to_jsonb(g)->>'demo_workspace_id') IS NOT DISTINCT FROM $3::text`,[cursor,actor.userId,actor.demoWorkspaceId??null])).rows[0];if(!before)throw new DomainError('NOT_FOUND',404);}
   const rows=(await c.query(`SELECT o.id,o.state,o.cleanup,o.amount_minor,os.snapshot,
    (SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'ordinal',m.ordinal,'kind',p.kind,'state',p.state,'providerReference',p.provider_id,
     'canCheck',p.state IN ('UNKNOWN','PENDING','ACTION_REQUIRED') AND p.dispatched_at IS NOT NULL
      AND (p.state='PENDING' OR p.retry_until IS NULL OR p.retry_until<=clock_timestamp())
      AND (p.lease_until IS NULL OR p.lease_until<clock_timestamp())) ORDER BY m.ordinal,p.created_at,p.id),'[]'::jsonb)
     FROM payment_operations p JOIN offer_members m ON m.id=p.member_id WHERE p.offer_id=o.id) AS operations
    FROM offers o JOIN offer_snapshots os ON os.offer_id=o.id
    JOIN merchant_studios s ON s.studio_id=os.snapshot->'candidate'->>'studioId' JOIN planning_groups g ON g.id=os.group_id
    WHERE s.owner_user_id=$1 AND (to_jsonb(g)->>'demo_workspace_id') IS NOT DISTINCT FROM $4::text
     AND EXISTS(SELECT 1 FROM payment_operations p WHERE p.offer_id=o.id AND
      (p.state IN ('UNKNOWN','PENDING','ACTION_REQUIRED') OR (p.kind IN ('VOID','REFUND') AND p.state='FAILED')))
     AND ($2::timestamptz IS NULL OR (o.opened_at,o.id)<($2::timestamptz,$3::uuid))
    ORDER BY o.opened_at DESC,o.id DESC LIMIT 21`,[actor.userId,before?.opened_at??null,before?.id??null,actor.demoWorkspaceId??null])).rows;
   const exceptions=rows.slice(0,20).map(r=>{
    const snapshot=snapshotSchema.parse(r.snapshot),ops=r.operations as {id:string;ordinal:number;kind:string;state:string;providerReference:string|null;canCheck:boolean}[];
    let awaitingVerifiedRefundMinor=0,uncertainCaptureMinor=0,authorizationAwaitingReleaseMinor=0;
    for(let ordinal=0;ordinal<snapshot.roster.length;ordinal++){
     const member=ops.filter(o=>o.ordinal===ordinal),capture=member.find(o=>o.kind==='CAPTURE'),refund=member.find(o=>o.kind==='REFUND'),authorization=member.find(o=>o.kind==='AUTHORIZE'),voidOp=member.find(o=>o.kind==='VOID');
     if(capture&&['DISPATCHED','UNKNOWN','PENDING','ACTION_REQUIRED'].includes(capture.state))uncertainCaptureMinor+=r.amount_minor;
     if(closedBookings.has(r.state)){
      if(capture?.state==='SUCCEEDED'&&refund?.state!=='SUCCEEDED')awaitingVerifiedRefundMinor+=r.amount_minor;
      if(authorization?.state==='SUCCEEDED'&&(!capture||capture.state==='FAILED')&&voidOp?.state!=='SUCCEEDED')authorizationAwaitingReleaseMinor+=r.amount_minor;
     }
    }
    return {offerId:r.id as string,booking:r.state as string,cleanup:r.cleanup as string,activity:snapshot.candidate.activity,studioName:snapshot.candidate.studioName,groupSize:snapshot.roster.length,startAt:snapshot.candidate.startAt,timezone:snapshot.candidate.timezone,
     awaitingVerifiedRefundMinor,uncertainCaptureMinor,authorizationAwaitingReleaseMinor,
     operations:ops.filter(o=>['UNKNOWN','PENDING','ACTION_REQUIRED'].includes(o.state)||(['VOID','REFUND'].includes(o.kind)&&o.state==='FAILED')).map(o=>({operationId:o.id,memberName:snapshot.roster[o.ordinal].displayName,kind:o.kind,state:o.state,providerReference:o.providerReference,
      originalProviderReference:ops.find(parent=>parent.ordinal===o.ordinal&&parent.kind===(o.kind==='REFUND'?'CAPTURE':o.kind==='VOID'?'AUTHORIZE':''))?.providerReference??null,canCheck:o.canCheck}))};
   });
   return {exceptions,nextCursor:rows.length>20?exceptions.at(-1)!.offerId:null};
  });
 }
 async checkMerchantPayment(actor:IntakeActor,value:unknown){const p=checkPaymentSchema.parse(value);
  return this.command(actor,p.commandId,{kind:'CHECK_MERCHANT_PAYMENT',...p},async c=>{
   const offer=(await c.query(`SELECT o.id,o.state FROM offers o JOIN offer_snapshots os ON os.offer_id=o.id
    JOIN merchant_studios s ON s.studio_id=os.snapshot->'candidate'->>'studioId' JOIN planning_groups g ON g.id=os.group_id
    WHERE o.id=$1 AND s.owner_user_id=$2 AND (to_jsonb(g)->>'demo_workspace_id') IS NOT DISTINCT FROM $3::text FOR UPDATE OF o`,[p.offerId,actor.userId,actor.demoWorkspaceId??null])).rows[0];
   if(!offer)throw new DomainError('NOT_FOUND',404);
   const op=(await c.query('SELECT id FROM payment_operations WHERE id=$1 AND offer_id=$2 FOR UPDATE',[p.operationId,p.offerId])).rows[0];
   if(!op)throw new DomainError('NOT_FOUND',404);
   // Only move the check time. Never reset an outcome, request ID, dispatch time,
   // payload, retry deadline or active lease. These states force worker GET-only.
   const due=await c.query(`UPDATE payment_operations SET next_check_at=least(next_check_at,clock_timestamp())
    WHERE id=$1 AND state IN ('UNKNOWN','PENDING','ACTION_REQUIRED') AND dispatched_at IS NOT NULL
     AND (state='PENDING' OR retry_until IS NULL OR retry_until<=clock_timestamp())
     AND (lease_until IS NULL OR lease_until<clock_timestamp()) RETURNING id`,[p.operationId]);
   if(!due.rowCount)throw new DomainError('PAYMENT_CHECK_UNAVAILABLE');
   await c.query("INSERT INTO payment_events(offer_id,event_type,operation_id,state) VALUES($1,'MERCHANT_CHECK_REQUESTED',$2,$3)",[p.offerId,p.operationId,offer.state]);
   return {checkRequested:true,operationId:p.operationId};
  });
 }
 private async ownedPaymentOperation(c:pg.PoolClient,actor:IntakeActor,id:string,lock=false){
  const scope=`FROM payment_operations p JOIN offers o ON o.id=p.offer_id
   JOIN offer_snapshots os ON os.offer_id=o.id JOIN merchant_studios s ON s.studio_id=os.snapshot->'candidate'->>'studioId'
   JOIN planning_groups g ON g.id=os.group_id JOIN offer_members m ON m.id=p.member_id
   WHERE p.id=$1 AND m.offer_id=o.id AND s.owner_user_id=$2 AND (to_jsonb(g)->>'demo_workspace_id') IS NOT DISTINCT FROM $3::text`;
  const args=[id,actor.userId,actor.demoWorkspaceId??null];
  // Match worker lock order: the offer first, then the existing operation.
  if(lock&&!(await c.query(`SELECT o.id ${scope} FOR UPDATE OF o`,args)).rowCount)throw new DomainError('NOT_FOUND',404);
  const row=(await c.query(`SELECT p.id,p.offer_id,p.kind,p.state,p.provider_id,p.dispatched_at,o.state AS booking_state,o.cleanup,o.amount_minor,os.snapshot,m.ordinal,
   (SELECT parent.provider_id FROM payment_operations parent WHERE parent.member_id=p.member_id AND parent.offer_id=p.offer_id
    AND parent.kind=CASE p.kind WHEN 'AUTHORIZE' THEN 'CREATE_ORDER' WHEN 'CAPTURE' THEN 'AUTHORIZE' WHEN 'VOID' THEN 'AUTHORIZE' WHEN 'REFUND' THEN 'CAPTURE' END) AS original_provider_id
   ${scope}${lock?' FOR UPDATE OF p':''}`,args)).rows[0];
  if(!row)throw new DomainError('NOT_FOUND',404);return row;
 }
 async merchantPaymentRecord(actor:IntakeActor,operationId:string,cursor:string|null=null){this.actor(actor);uuid.parse(operationId);if(cursor)uuid.parse(cursor);
  return transaction(this.pool,async c=>{
   const op=await this.ownedPaymentOperation(c,actor,operationId),snapshot=snapshotSchema.parse(op.snapshot);
   let before:{created_at:Date;id:string}|undefined;
   if(cursor){before=(await c.query('SELECT created_at,id FROM payment_reconciliation_evidence WHERE id=$1 AND operation_id=$2',[cursor,operationId])).rows[0];if(!before)throw new DomainError('NOT_FOUND',404);}
   const records=(await c.query(`SELECT id,source,reference,reported_outcome,operation_state_at_recording,created_at FROM payment_reconciliation_evidence
    WHERE operation_id=$1 AND ($2::timestamptz IS NULL OR (created_at,id)<($2::timestamptz,$3::uuid)) ORDER BY created_at DESC,id DESC LIMIT 21`,[operationId,before?.created_at??null,before?.id??null])).rows;
   const count=(await c.query('SELECT count(*)::int AS n FROM payment_reconciliation_evidence WHERE operation_id=$1',[operationId])).rows[0].n;
   return {operationId,offerId:op.offer_id as string,kind:op.kind as string,state:op.state as string,booking:op.booking_state as string,cleanup:op.cleanup as string,
    activity:snapshot.candidate.activity,memberName:snapshot.roster[op.ordinal].displayName,amountMinor:op.amount_minor as number,currency:'USD' as const,timezone:snapshot.candidate.timezone,
    providerReference:op.provider_id as string|null,originalProviderReference:op.original_provider_id as string|null,canRecord:canRecordEvidence(op)&&count<50,recordLimitReached:count>=50,
    records:records.slice(0,20).map(r=>({id:r.id as string,source:r.source as 'TRANSACTION'|'SUPPORT_CASE',reference:r.reference as string,
     reportedOutcome:r.reported_outcome as 'COMPLETED'|'PENDING'|'FAILED'|'UNRESOLVED',operationStateAtRecording:r.operation_state_at_recording as string,recordedAt:r.created_at.toISOString() as string})),
    nextCursor:records.length>20?records[19].id as string:null};
  });
 }
 async recordMerchantPaymentEvidence(actor:IntakeActor,value:unknown){const p=evidenceSchema.parse(value);
  return this.command(actor,p.commandId,{kind:'RECORD_PAYMENT_EVIDENCE',...p},async c=>{
   const op=await this.ownedPaymentOperation(c,actor,p.operationId,true);
   if(op.state!==p.expectedOperationState)throw new DomainError('PAYMENT_EVIDENCE_STALE');
   if(!canRecordEvidence(op))throw new DomainError('PAYMENT_EVIDENCE_UNAVAILABLE');
   const existing=(await c.query('SELECT id FROM payment_reconciliation_evidence WHERE operation_id=$1 AND source=$2 AND reference=$3 AND reported_outcome=$4',[p.operationId,p.source,p.reference,p.reportedOutcome])).rows[0];
   if(existing)return {evidenceId:existing.id as string};
   if((await c.query('SELECT count(*)::int AS n FROM payment_reconciliation_evidence WHERE operation_id=$1',[p.operationId])).rows[0].n>=50)throw new DomainError('PAYMENT_EVIDENCE_LIMIT');
   await c.query('INSERT INTO payment_reconciliation_evidence(id,operation_id,recorded_by,source,reference,reported_outcome,operation_state_at_recording) VALUES($1,$2,$3,$4,$5,$6,$7)',[p.commandId,p.operationId,actor.userId,p.source,p.reference,p.reportedOutcome,op.state]);
   await c.query("INSERT INTO payment_events(offer_id,event_type,operation_id,state) VALUES($1,'STUDIO_EVIDENCE_RECORDED',$2,$3)",[op.offer_id,p.operationId,op.booking_state]);
   return {evidenceId:p.commandId};
  });
 }
 async merchantRequest(actor:IntakeActor,requestId:string){this.actor(actor);uuid.parse(requestId);
  return transaction(this.pool,async c=>{
   const request=(await c.query('SELECT r.*,s.owner_user_id,s.setup_minutes,s.cleanup_minutes FROM merchant_requests r JOIN merchant_studios s ON s.studio_id=r.studio_id WHERE r.id=$1',[requestId])).rows[0];
   if(!request||request.owner_user_id!==actor.userId)throw new DomainError('NOT_FOUND',404);
   const g=await this.group(c,request.group_id,actor);
   if(request.state==='APPROVED')return {requestId,state:'APPROVED' as const,offerId:request.approved_offer_id};
   if(g.state!=='MERCHANT_REVIEW'||g.revision!==request.planning_revision)return {requestId,state:'STALE' as const};
   const plan=await confirmedPlan(c,g.id,g.catalog);if(plan.sourceHash!==request.source_hash)return {requestId,state:'STALE' as const};
   const candidate=this.selected(plan,request.offering_id,request.slot_id);
   return {requestId,state:'PENDING' as const,revision:g.revision,candidate,
    reservation:{occupiedStart:new Date(Date.parse(candidate.startAt)-request.setup_minutes*60000).toISOString(),occupiedEnd:new Date(Date.parse(candidate.endAt)+request.cleanup_minutes*60000).toISOString(),setupMinutes:request.setup_minutes as number,cleanupMinutes:request.cleanup_minutes as number},roster:plan.rows.map(r=>({memberId:r.id,displayName:r.display_name})),
    collectionArrangements:plan.preferences.filter(pref=>pref.collection==='NOMINEE_LATER').map(pref=>({ownerName:plan.rows.find(r=>r.id===pref.memberId)!.display_name,nomineeName:plan.rows.find(r=>r.id===pref.nomineeMemberId)!.display_name}))};
  });
 }
 async offer(actor:IntakeActor,offerId:string){this.actor(actor);uuid.parse(offerId);
  const row=(await this.pool.query(`SELECT os.snapshot,o.offer_hash,o.state,o.cleanup,g.revision AS planning_revision,g.state AS planning_state,
    to_jsonb(g)->>'demo_workspace_id' AS demo_workspace_id,
    g.organizer_id=$2 AS is_organizer,
    NOT EXISTS(SELECT 1 FROM merchant_requests r WHERE r.group_id=g.id AND r.state='APPROVED' AND r.planning_revision>(os.snapshot->>'planningRevision')::integer) AS is_latest,
    EXISTS(SELECT 1 FROM cancellation_requests cr JOIN offer_members m ON m.id=cr.member_id WHERE m.offer_id=o.id AND m.user_id=$2) AS cancellation_requested,
    (SELECT count(*)::integer FROM cancellation_requests cr JOIN offer_members m ON m.id=cr.member_id WHERE m.offer_id=o.id) AS cancellation_request_count,
    EXISTS(SELECT 1 FROM offer_members m WHERE m.offer_id=o.id AND m.user_id=$2) AS is_participant,
    EXISTS(SELECT 1 FROM merchant_studios s WHERE s.studio_id=os.snapshot->'candidate'->>'studioId' AND s.owner_user_id=$2) AS is_merchant
    FROM offer_snapshots os JOIN offers o ON o.id=os.offer_id JOIN planning_groups g ON g.id=os.group_id
    WHERE os.offer_id=$1 AND (EXISTS(SELECT 1 FROM offer_members m WHERE m.offer_id=o.id AND m.user_id=$2)
    OR EXISTS(SELECT 1 FROM merchant_studios s WHERE s.studio_id=os.snapshot->'candidate'->>'studioId' AND s.owner_user_id=$2))`,[offerId,actor.userId])).rows[0];
  if(!row)throw new DomainError('NOT_FOUND',404);assertWorkspaceScope(actor,row);const snapshot=snapshotSchema.parse(row.snapshot);
  if(fingerprint(snapshot)!==row.offer_hash)throw new DomainError('OFFER_INTEGRITY_FAILURE',500);
  const paymentRecords=row.is_merchant?(await this.pool.query(`SELECT p.id,p.kind,m.ordinal FROM payment_operations p JOIN offer_members m ON m.id=p.member_id
   WHERE p.offer_id=$1 AND (p.state IN ('UNKNOWN','PENDING','ACTION_REQUIRED') OR p.kind IN ('VOID','REFUND') AND p.state='FAILED'
    OR EXISTS(SELECT 1 FROM payment_reconciliation_evidence e WHERE e.operation_id=p.id)) ORDER BY m.ordinal,p.created_at,p.id LIMIT 40`,[offerId])).rows.map(p=>({operationId:p.id as string,kind:p.kind as string,memberName:snapshot.roster[p.ordinal].displayName})):[];
  return {offerHash:row.offer_hash,booking:row.state,snapshot,cleanup:row.cleanup as string,planningRevision:row.planning_revision as number,
   isParticipant:row.is_participant as boolean,isMerchant:row.is_merchant as boolean,isOrganizer:row.is_organizer as boolean,
   paymentRecords,cancellationRequested:row.is_participant?row.cancellation_requested as boolean:false,
   cancellationRequestCount:row.is_merchant?row.cancellation_request_count as number:null,
   canReopen:Boolean(row.is_organizer&&row.is_latest&&row.planning_state==='OFFER_ISSUED'&&closedBookings.has(row.state)&&row.cleanup==='COMPLETE')};
 }
}
