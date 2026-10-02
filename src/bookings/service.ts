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
 private actor(a:IntakeActor){uuid.parse(a.userId);if(a.emailVerified!==true)throw new DomainError('VERIFIED_IDENTITY_REQUIRED',401);}
 private async command<T>(actor:IntakeActor,id:string,payload:unknown,fn:(c:pg.PoolClient)=>Promise<T>):Promise<T>{
  this.actor(actor);return transaction(this.pool,async c=>{
   await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[id]);
   const hash=fingerprint(payload),prior=(await c.query('SELECT actor_id,fingerprint,result FROM intake_commands WHERE id=$1',[id])).rows[0];
   if(prior){if(prior.actor_id!==actor.userId||prior.fingerprint!==hash)throw new DomainError('COMMAND_CONFLICT');return prior.result as T;}
   const result=await fn(c);await c.query('INSERT INTO intake_commands VALUES($1,$2,$3,$4)',[id,actor.userId,hash,JSON.stringify(result)]);return result;
  });
 }
 private async group(c:pg.PoolClient,id:string){const g=(await c.query('SELECT * FROM planning_groups WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!g)throw new DomainError('NOT_FOUND',404);return g;}
 private selected(plan:Awaited<ReturnType<typeof confirmedPlan>>,offeringId:string,slotId:string):Candidate{
  if(plan.result.state!=='CANDIDATE_READY')throw new DomainError('NO_VALID_CANDIDATE',422);
  const candidate=plan.result.candidates.find(c=>c.offeringId===offeringId&&c.slotId===slotId);if(!candidate)throw new DomainError('NO_VALID_CANDIDATE',422);return candidate;
 }
 async request(actor:IntakeActor,value:unknown){const p=requestSchema.parse(value);return this.command(actor,p.commandId,{kind:'REQUEST_OFFER',...p},async c=>{
  const g=await this.group(c,p.groupId);if(g.organizer_id!==actor.userId)throw new DomainError('NOT_FOUND',404);
  if(g.state!=='CLOSED'||g.revision!==p.expectedRevision)throw new DomainError('STALE_PLANNING');
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
 async approve(actor:IntakeActor,value:unknown){const p=approveSchema.parse(value);
  try{return await this.command(actor,p.commandId,{kind:'APPROVE_OFFER',...p},async c=>{
   const request=(await c.query('SELECT r.*,s.owner_user_id,s.paypal_merchant_id,s.resource_id,s.setup_minutes,s.cleanup_minutes FROM merchant_requests r JOIN merchant_studios s ON s.studio_id=r.studio_id WHERE r.id=$1',[p.requestId])).rows[0];
   if(!request||request.owner_user_id!==actor.userId)throw new DomainError('NOT_FOUND',404);
   const g=await this.group(c,request.group_id);
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
   if(cursor){before=(await c.query('SELECT r.created_at,r.id FROM merchant_requests r JOIN merchant_studios s ON s.studio_id=r.studio_id WHERE r.id=$1 AND s.owner_user_id=$2',[cursor,actor.userId])).rows[0];if(!before)throw new DomainError('NOT_FOUND',404);}
   const rows=(await c.query(`SELECT r.id,r.created_at,r.offering_id,r.slot_id,v.catalog,g.target_size
    FROM merchant_requests r JOIN merchant_studios s ON s.studio_id=r.studio_id
    JOIN merchant_catalog_versions v ON v.studio_id=r.studio_id AND v.version_id=r.catalog_version_id
    JOIN planning_groups g ON g.id=r.group_id
    WHERE s.owner_user_id=$1 AND r.state='PENDING' AND g.state='MERCHANT_REVIEW' AND g.revision=r.planning_revision
    AND ($2::timestamptz IS NULL OR (r.created_at,r.id)<($2::timestamptz,$3::uuid))
    ORDER BY r.created_at DESC,r.id DESC LIMIT 21`,[actor.userId,before?.created_at??null,before?.id??null])).rows;
   const requests=rows.slice(0,20).map(r=>{const catalog=catalogSchema.parse(r.catalog),offering=catalog.offerings.find(o=>o.id===r.offering_id),slot=catalog.slots.find(s=>s.id===r.slot_id);
    if(!offering||!slot)throw new DomainError('UNVERIFIED_CATALOG',422);
    return {requestId:r.id as string,studioName:catalog.studioName,activity:offering.name,startAt:slot.startAt,timezone:catalog.timezone,amountMinor:offering.priceMinor,groupSize:r.target_size as number};});
   return {requests,nextCursor:rows.length>20?requests.at(-1)!.requestId:null};
  });
 }
 async merchantRequest(actor:IntakeActor,requestId:string){this.actor(actor);uuid.parse(requestId);
  return transaction(this.pool,async c=>{
   const request=(await c.query('SELECT r.*,s.owner_user_id,s.setup_minutes,s.cleanup_minutes FROM merchant_requests r JOIN merchant_studios s ON s.studio_id=r.studio_id WHERE r.id=$1',[requestId])).rows[0];
   if(!request||request.owner_user_id!==actor.userId)throw new DomainError('NOT_FOUND',404);
   const g=await this.group(c,request.group_id);
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
  const row=(await this.pool.query(`SELECT os.snapshot,o.offer_hash,o.state,
    EXISTS(SELECT 1 FROM offer_members m WHERE m.offer_id=o.id AND m.user_id=$2) AS is_participant,
    EXISTS(SELECT 1 FROM merchant_studios s WHERE s.studio_id=os.snapshot->'candidate'->>'studioId' AND s.owner_user_id=$2) AS is_merchant
    FROM offer_snapshots os JOIN offers o ON o.id=os.offer_id
    WHERE os.offer_id=$1 AND (EXISTS(SELECT 1 FROM offer_members m WHERE m.offer_id=o.id AND m.user_id=$2)
    OR EXISTS(SELECT 1 FROM merchant_studios s WHERE s.studio_id=os.snapshot->'candidate'->>'studioId' AND s.owner_user_id=$2))`,[offerId,actor.userId])).rows[0];
  if(!row)throw new DomainError('NOT_FOUND',404);const snapshot=snapshotSchema.parse(row.snapshot);
  if(fingerprint(snapshot)!==row.offer_hash)throw new DomainError('OFFER_INTEGRITY_FAILURE',500);
  return {offerHash:row.offer_hash,booking:row.state,snapshot,isParticipant:row.is_participant as boolean,isMerchant:row.is_merchant as boolean};
 }
}
