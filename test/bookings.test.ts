import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {database,localDatabaseUrl} from '../src/db.ts';
import {ClarificationService} from '../src/intake/clarifications.ts';
import {IntakeService,type IntakeActor} from '../src/intake/service.ts';
import {BookingService} from '../src/bookings/service.ts';
import {PaymentEngine} from '../src/payments/engine.ts';
import {SimulatedProvider} from './simulated-provider.ts';
const schema=`booking_test_${randomUUID().replaceAll('-','')}`,admin=database(process.env.TEST_DATABASE_URL??localDatabaseUrl);
const url=new URL(process.env.TEST_DATABASE_URL??localDatabaseUrl);url.searchParams.set('options',`-c search_path=${schema},public`);
const pool=database(url.toString()),intake=new IntakeService(pool),bookings=new BookingService(pool);
const actor=():IntakeActor=>({userId:randomUUID(),emailVerified:true});
const merchant=actor();
const baseCatalog=JSON.parse(await readFile(new URL('../fixtures/studio.json',import.meta.url),'utf8'));
const catalog={...baseCatalog,slots:baseCatalog.slots.map((s:{id:string},i:number)=>({...s,startAt:new Date(Date.now()+(3+i)*86400000).toISOString()}))};
const migrations=['001_payments','004_private_intake','005_collection_consent','006_merchant_offers','007_clarifications','008_cancellations'];
before(async()=>{await admin.query(`CREATE SCHEMA ${schema}`);for(const file of migrations)await pool.query(await readFile(new URL('../db/'+file+'.sql',import.meta.url),'utf8'));
 await pool.query('INSERT INTO merchant_studios VALUES($1,$2,$3,$4,$5,$6)',[catalog.studioId,merchant.userId,'synthetic_merchant','studio-exclusive',15,20]);
 await pool.query('INSERT INTO merchant_catalog_versions(studio_id,version_id,catalog) VALUES($1,$2,$3)',[catalog.studioId,catalog.versionId,JSON.stringify(catalog)]);
});
after(async()=>{await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();});
const preference={budgetMinor:5000,availableSlotIds:['thu-evening'],latestFinishAt:null,technique:'ANY',outcome:'FORM_OWN_CUP',collection:'SELF_LATER',nomineeMemberId:null,extraRequirement:'NONE',unresolvedKeys:[]};
async function setup(cat=catalog){const actors=Array.from({length:6},actor),g=await intake.create(actors[0],{commandId:randomUUID(),targetSize:6,displayName:'Organizer',catalog:cat});
 const memberIds=[g.memberId];for(let i=1;i<6;i++)memberIds.push((await intake.join(actors[i],{commandId:randomUUID(),invite:g.invite,displayName:`Person ${i}`})).memberId);
 let revision=(await intake.roster(actors[0],g.groupId)).revision;const preferenceIds:string[]=[];
 for(const a of actors){const draft=await intake.save(a,{commandId:randomUUID(),groupId:g.groupId,expectedRevision:revision,expectedPreferenceId:null,preference,optionalText:'Private words never shared'});const save=await new ClarificationService(pool).confirmStructuredNote(a,{commandId:randomUUID(),groupId:g.groupId,expectedRevision:draft.revision,preferenceId:draft.preferenceId,declaresNoAdditionalMustHaves:true});revision=save.revision;preferenceIds.push(save.preferenceId);}
 const closed=await intake.closeRoster(actors[0],{commandId:randomUUID(),groupId:g.groupId,expectedRevision:revision,memberIds});
 return {actors,g,memberIds,preferenceIds,revision:closed.revision};
}
async function request(x:Awaited<ReturnType<typeof setup>>,slotId='thu-evening'){
 return bookings.request(x.actors[0],{commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:x.revision,offeringId:'handbuild',slotId});
}
const approval=(r:{requestId:string;revision:number})=>({commandId:randomUUID(),requestId:r.requestId,expectedRevision:r.revision,factsConfirmed:true,externalCalendarBlocked:true,automaticSettlementAgreed:true,collectionArrangementsAgreed:true});
async function release(offerId:string){await pool.query("UPDATE reservations SET state='RELEASED' WHERE offer_id=$1",[offerId]);}
async function settle(engine:PaymentEngine,offerId:string,max=30){for(let i=0;i<max;i++)if(!await engine.step(offerId))break;}
test('six-person private intake becomes a frozen merchant-approved offer and verified booking',async()=>{
 const x=await setup(),r=await request(x),review=await bookings.merchantRequest(merchant,r.requestId);
 assert.equal(review.state,'PENDING');if(review.state!=='PENDING')throw new Error('MISSING_REVIEW');assert.equal(Date.parse(review.candidate.startAt)-Date.parse(review.reservation.occupiedStart),15*60000);assert.equal(Date.parse(review.reservation.occupiedEnd)-Date.parse(review.candidate.endAt),20*60000);assert.ok(!JSON.stringify(review).includes('budget'));assert.ok(!JSON.stringify(review).includes('Private words'));
 const pendingContext=await intake.participantContext(x.actors[0],x.g.groupId);assert.equal(pendingContext.studioReviewPending,true);assert.equal(pendingContext.offerId,null);
 const command=approval(r),approved=await bookings.approve(merchant,command);
 const issuedContext=await intake.participantContext(x.actors[0],x.g.groupId);assert.equal(issuedContext.studioReviewPending,false);assert.equal(issuedContext.offerId,approved.offerId);assert.equal(issuedContext.bookingState,'OPEN');
 assert.deepEqual(await new BookingService(pool).approve(merchant,command),approved);
 const view=await bookings.offer(x.actors[0],approved.offerId);assert.equal(view.isParticipant,true);assert.equal(view.isMerchant,false);const merchantView=await bookings.offer(merchant,approved.offerId);assert.equal(merchantView.isParticipant,false);assert.equal(merchantView.isMerchant,true);assert.equal(view.booking,'OPEN');assert.equal(view.snapshot.candidate.amountMinor,4800);assert.equal(view.snapshot.roster.length,6);
 assert.equal(Date.parse(view.snapshot.deadline)-Date.parse(view.snapshot.openedAt),7200000);assert.equal(Date.parse(view.snapshot.reservationEnd)-Date.parse(view.snapshot.deadline),1800000);
 assert.equal(Date.parse(view.snapshot.candidate.startAt)-Date.parse(view.snapshot.reservation.occupiedStart),15*60000);
 assert.equal(Date.parse(view.snapshot.reservation.occupiedEnd)-Date.parse(view.snapshot.candidate.endAt),20*60000);
 assert.ok(!JSON.stringify(view).includes('budgetMinor'));assert.ok(!JSON.stringify(view).includes(x.actors[0].userId));
 const provider=new SimulatedProvider(),engine=new PaymentEngine(pool,provider,{reconcileDelayMs:0});
 for(const a of x.actors){await engine.accept({commandId:randomUUID(),actorId:a.userId,offerId:approved.offerId,offerHash:approved.offerHash});await engine.step(approved.offerId);}
 for(const a of x.actors){await engine.authorize({commandId:randomUUID(),actorId:a.userId,offerId:approved.offerId,offerHash:approved.offerHash});await engine.step(approved.offerId);}
 assert.equal((await bookings.offer(x.actors[0],approved.offerId)).booking,'SETTLING');await settle(engine,approved.offerId);
 assert.equal((await bookings.offer(merchant,approved.offerId)).booking,'CONFIRMED');assert.equal((await intake.participantContext(x.actors[0],x.g.groupId)).bookingState,'CONFIRMED');assert.equal(provider.financialEffects.captures,6);
 assert.equal((await engine.participantStatus(approved.offerId,x.actors[0].userId)).payment,'PAYMENT_COMPLETED');
 assert.equal((await pool.query('SELECT state FROM reservations WHERE offer_id=$1',[approved.offerId])).rows[0].state,'BOOKED');
 await pool.query("UPDATE reservations SET state='COMPLETED' WHERE offer_id=$1",[approved.offerId]);
});
test('request and approval reject foreign actors, invented candidates, changed amounts and absent attestation',async()=>{
 const x=await setup();await assert.rejects(bookings.request(x.actors[1],{commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:x.revision,offeringId:'handbuild',slotId:'thu-evening'}),/NOT_FOUND/);
 await assert.rejects(bookings.request(x.actors[0],{commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:x.revision,offeringId:'invented',slotId:'thu-evening'}),/NO_VALID_CANDIDATE/);
 const r=await request(x);await assert.rejects(bookings.approve(x.actors[0],approval(r)),/NOT_FOUND/);await assert.rejects(bookings.merchantRequest(x.actors[1],r.requestId),/NOT_FOUND/);
 await assert.rejects(bookings.approve(merchant,{...approval(r),externalCalendarBlocked:false}));await assert.rejects(bookings.approve(merchant,{...approval(r),amountMinor:1}));
 const approved=await bookings.approve(merchant,approval(r));await assert.rejects(bookings.offer(actor(),approved.offerId),/NOT_FOUND/);await release(approved.offerId);
});
test('pre-issuance edits invalidate pending merchant review and require a fresh request',async()=>{
 const x=await setup(),r=await request(x);
 const saved=await intake.save(x.actors[1],{commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:r.revision,expectedPreferenceId:x.preferenceIds[1],preference:{...preference,budgetMinor:9000},optionalText:null});
 assert.equal((await bookings.merchantRequest(merchant,r.requestId)).state,'STALE');await assert.rejects(bookings.approve(merchant,approval(r)),/STALE_PLANNING/);
 const fresh=await bookings.request(x.actors[0],{commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:saved.revision,offeringId:'handbuild',slotId:'thu-evening'});
 const approved=await bookings.approve(merchant,approval(fresh));await assert.rejects(intake.save(x.actors[1],{commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:approved.revision,expectedPreferenceId:saved.preferenceId,preference,optionalText:null}),/PLANNING_LOCKED/);await release(approved.offerId);
});
test('concurrent overlapping merchant approvals have one persisted winner and a safe conflict',async()=>{
 const a=await setup(),b=await setup(),ra=await request(a),rb=await request(b);
 const results=await Promise.allSettled([bookings.approve(merchant,approval(ra)),bookings.approve(merchant,approval(rb))]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.ok(results.some(r=>r.status==='rejected'&&r.reason.code==='RESERVATION_CONFLICT'));
 const ids=results.flatMap(r=>r.status==='fulfilled'?[r.value.offerId]:[]);assert.equal(Number((await pool.query('SELECT count(*) FROM reservations WHERE offer_id=ANY($1::uuid[]) AND state=$2',[ids,'HELD'])).rows[0].count),1);
 for(const id of ids)await release(id);
});
test('published catalog and issued snapshot are immutable; payment terms and roster cannot be rewritten',async()=>{
 const x=await setup(),r=await request(x),approved=await bookings.approve(merchant,approval(r));
 await assert.rejects(pool.query('UPDATE merchant_catalog_versions SET catalog=$1 WHERE studio_id=$2',[JSON.stringify({...catalog,studioName:'Changed'}),catalog.studioId]),{code:'23514'});
 await assert.rejects(pool.query("UPDATE offer_snapshots SET snapshot='{}' WHERE offer_id=$1",[approved.offerId]),{code:'23514'});
 await assert.rejects(pool.query('UPDATE offers SET amount_minor=1 WHERE id=$1',[approved.offerId]),{code:'23514'});
 await assert.rejects(pool.query('UPDATE offer_members SET user_id=$2 WHERE offer_id=$1',[approved.offerId,randomUUID()]),{code:'23514'});
 await assert.rejects(pool.query('DELETE FROM offer_members WHERE offer_id=$1',[approved.offerId]),{code:'23514'});
 await assert.rejects(pool.query('INSERT INTO offer_members(id,offer_id,user_id,ordinal) VALUES($1,$2,$3,7)',[randomUUID(),approved.offerId,randomUUID()]),{code:'23514'});
 await assert.rejects(pool.query("UPDATE preference_revisions SET confirmed=jsonb_set(confirmed,'{budgetMinor}','1') WHERE id=$1",[x.preferenceIds[0]]),{code:'23514'});
 await pool.query('UPDATE preference_revisions SET optional_text=NULL WHERE id=$1',[x.preferenceIds[0]]);
 assert.equal((await bookings.offer(x.actors[0],approved.offerId)).snapshot.candidate.amountMinor,4800);await release(approved.offerId);
});
test('unpublished catalogs and sessions inside the 24-hour lead time cannot open booking',async()=>{
 const altered=structuredClone(catalog);altered.studioName='Unverified';const x=await setup(altered);await assert.rejects(request(x),/UNVERIFIED_CATALOG/);
 const soon=structuredClone(catalog);soon.versionId='soon-v1';soon.slots[0].startAt=new Date(Date.now()+86400000).toISOString();
 await pool.query('INSERT INTO merchant_catalog_versions(studio_id,version_id,catalog) VALUES($1,$2,$3)',[soon.studioId,soon.versionId,JSON.stringify(soon)]);
 const y=await setup(soon),r=await request(y);await assert.rejects(bookings.approve(merchant,approval(r)),/SESSION_TOO_SOON/);
 assert.equal((await intake.roster(y.actors[0],y.g.groupId)).state,'MERCHANT_REVIEW');
});
test('approved booking failure recovers through existing payment compensation without false confirmation',async()=>{
 const x=await setup(),r=await request(x),approved=await bookings.approve(merchant,approval(r));
 const provider=new SimulatedProvider(),engine=new PaymentEngine(pool,provider,{reconcileDelayMs:0});
 for(const a of x.actors){await engine.accept({commandId:randomUUID(),actorId:a.userId,offerId:approved.offerId,offerHash:approved.offerHash});await engine.step(approved.offerId);}
 for(const a of x.actors){await engine.authorize({commandId:randomUUID(),actorId:a.userId,offerId:approved.offerId,offerHash:approved.offerHash});await engine.step(approved.offerId);}
 const members=(await pool.query('SELECT id FROM offer_members WHERE offer_id=$1 ORDER BY ordinal',[approved.offerId])).rows;provider.failedMembers.add(members[1].id);await settle(engine,approved.offerId);
 assert.equal((await bookings.offer(x.actors[0],approved.offerId)).booking,'ABORTED');assert.deepEqual(provider.financialEffects,{captures:1,refunds:1,voids:5});
 assert.equal((await pool.query('SELECT state FROM reservations WHERE offer_id=$1',[approved.offerId])).rows[0].state,'RELEASED');
});
test('merchant offer migration reverses and reapplies in an isolated empty schema',async()=>{
 const temporary=`merchant_migration_${randomUUID().replaceAll('-','')}`;await admin.query(`CREATE SCHEMA ${temporary}`);
 const tempUrl=new URL(process.env.TEST_DATABASE_URL??localDatabaseUrl);tempUrl.searchParams.set('options',`-c search_path=${temporary},public`);const temp=database(tempUrl.toString());
 try{for(const file of migrations)await temp.query(await readFile(new URL('../db/'+file+'.sql',import.meta.url),'utf8'));
 await temp.query(await readFile(new URL('../db/006_merchant_offers.down.sql',import.meta.url),'utf8'));await temp.query(await readFile(new URL('../db/006_merchant_offers.sql',import.meta.url),'utf8'));
 assert.equal((await temp.query('SELECT count(*) FROM offer_snapshots')).rows[0].count,'0');
 }finally{await temp.end();await admin.query(`DROP SCHEMA ${temporary} CASCADE`);}
});
test('revoked collection arrangement invalidates merchant review and cannot enter a frozen offer',async()=>{
 const x=await setup();const draft=await intake.save(x.actors[0],{commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:x.revision,expectedPreferenceId:x.preferenceIds[0],preference:{...preference,collection:'NOMINEE_LATER',nomineeMemberId:x.memberIds[1]},optionalText:'Private travel detail'});const saved=await new ClarificationService(pool).confirmStructuredNote(x.actors[0],{commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:draft.revision,preferenceId:draft.preferenceId,declaresNoAdditionalMustHaves:true});
 const consent=(revision:number,action:string)=>({commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:revision,preferenceId:saved.preferenceId,action,disclosureAgreed:true});
 const owner=await intake.collectionConsent(x.actors[0],consent(saved.revision,'OWNER_AGREE')),nominee=await intake.collectionConsent(x.actors[1],consent(owner.revision,'NOMINEE_AGREE'));
 const r=await bookings.request(x.actors[0],{commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:nominee.revision,offeringId:'handbuild',slotId:'thu-evening'});
 const review=await bookings.merchantRequest(merchant,r.requestId);assert.equal(review.state,'PENDING');
 if(review.state!=='PENDING')throw new Error('Missing review');assert.equal(review.collectionArrangements[0].nomineeName,'Person 1');assert.ok(!JSON.stringify(review).includes('Private travel'));
 await intake.collectionConsent(x.actors[1],consent(r.revision,'REVOKE'));
 assert.equal((await bookings.merchantRequest(merchant,r.requestId)).state,'STALE');await assert.rejects(bookings.approve(merchant,approval(r)),/STALE_PLANNING/);
 assert.equal((await intake.plan(x.actors[0],x.g.groupId)).result.state,'NEEDS_CLARIFICATION');
});

test('studio queue is owner-scoped, bounded, cursor-stable and excludes invalidated requests',async()=>{
 const owner=actor(),cat={...catalog,studioId:'queue-studio',versionId:'queue-v1',studioName:'Queue studio'};
 await pool.query('INSERT INTO merchant_studios VALUES($1,$2,$3,$4,$5,$6)',[cat.studioId,owner.userId,'queue_merchant','queue-exclusive',15,20]);
 await pool.query('INSERT INTO merchant_catalog_versions(studio_id,version_id,catalog) VALUES($1,$2,$3)',[cat.studioId,cat.versionId,JSON.stringify(cat)]);
 await assert.rejects(bookings.merchantQueue(actor()),/NOT_FOUND/);
 const items=[];for(let i=0;i<21;i++){const x=await setup(cat);items.push({x,r:await request(x)});}
 const first=await bookings.merchantQueue(owner);assert.equal(first.requests.length,20);assert.ok(first.nextCursor);
 assert.equal(first.requests[0].requestId,items.at(-1)!.r.requestId);
 const serialized=JSON.stringify(first);for(const field of ['budget','Private words','sourceHash','organizer_id'])assert.ok(!serialized.includes(field));
 assert.ok(!serialized.includes(items[0].x.actors[0].userId));
 await assert.rejects(bookings.merchantQueue(merchant,first.nextCursor),/NOT_FOUND/);
 await assert.rejects(bookings.merchantQueue(owner,'invented'));
 // An item moving out of the pending queue must not invalidate its cursor.
 const cursorItem=items.find(i=>i.r.requestId===first.nextCursor)!;
 const approved=await bookings.approve(owner,approval(cursorItem.r));
 const rest=await bookings.merchantQueue(owner,first.nextCursor);assert.equal(rest.requests.length,1);assert.equal(rest.requests[0].requestId,items[0].r.requestId);assert.equal(rest.nextCursor,null);
 const newest=items.at(-1)!;await intake.save(newest.x.actors[0],{commandId:randomUUID(),groupId:newest.x.g.groupId,expectedRevision:newest.r.revision,expectedPreferenceId:newest.x.preferenceIds[0],preference,optionalText:null});
 assert.ok(!(await bookings.merchantQueue(owner)).requests.some(r=>r.requestId===newest.r.requestId));
 await release(approved.offerId);
});

async function funded(){
 const x=await setup(),r=await request(x),issued=await bookings.approve(merchant,approval(r));
 const provider=new SimulatedProvider(),engine=new PaymentEngine(pool,provider,{reconcileDelayMs:0});
 const command=(a:IntakeActor)=>({commandId:randomUUID(),actorId:a.userId,offerId:issued.offerId,offerHash:issued.offerHash});
 for(const a of x.actors){await engine.accept(command(a));await engine.step(issued.offerId);}
 for(const a of x.actors){await engine.authorize(command(a));await engine.step(issued.offerId);}
 return {x,issued,provider,engine,command};
}
test('studio cancellation releases confirmed inventory, refunds every capture once and gates a separate planning round',async()=>{
 const f=await funded();await settle(f.engine,f.issued.offerId);
 assert.equal((await bookings.offer(f.x.actors[0],f.issued.offerId)).booking,'CONFIRMED');
 await assert.rejects(f.engine.cancelByMerchant({...f.command(f.x.actors[0]),agreesToFullRefund:true}),/NOT_FOUND/);
 await assert.rejects(f.engine.cancelByMerchant({...f.command(merchant),agreesToFullRefund:false}));
 const cancel={...f.command(merchant),agreesToFullRefund:true},before=await bookings.offer(merchant,f.issued.offerId);
 assert.equal((await f.engine.cancelByMerchant(cancel)).state,'CANCELED');
 assert.equal((await pool.query('SELECT state FROM reservations WHERE offer_id=$1',[f.issued.offerId])).rows[0].state,'CANCELED');
 assert.equal((await bookings.offer(f.x.actors[0],f.issued.offerId)).canReopen,false);
 const reopen={commandId:randomUUID(),groupId:f.x.g.groupId,offerId:f.issued.offerId,offerHash:f.issued.offerHash,expectedRevision:f.issued.revision,acknowledgesNewApprovals:true};
 await assert.rejects(bookings.reopen(f.x.actors[0],reopen),/PAYMENT_RECOVERY_REQUIRED/);
 await settle(f.engine,f.issued.offerId);assert.deepEqual(f.provider.financialEffects,{captures:6,refunds:6,voids:0});
 await f.engine.cancelByMerchant(cancel);await settle(f.engine,f.issued.offerId);assert.equal(f.provider.financialEffects.refunds,6);
 assert.equal((await f.engine.participantStatus(f.issued.offerId,f.x.actors[0].userId)).payment,'REFUND_COMPLETED');
 const after=await bookings.offer(f.x.actors[0],f.issued.offerId);assert.deepEqual(after.snapshot,before.snapshot);assert.equal(after.canReopen,true);
 await assert.rejects(bookings.reopen(f.x.actors[1],{...reopen,commandId:randomUUID()}),/NOT_FOUND/);
 const reopened=await bookings.reopen(f.x.actors[0],reopen);assert.deepEqual(await bookings.reopen(f.x.actors[0],reopen),reopened);
 const next=await bookings.request(f.x.actors[0],{commandId:randomUUID(),groupId:f.x.g.groupId,expectedRevision:reopened.revision,offeringId:'handbuild',slotId:'thu-evening'});
 const replacement=await bookings.approve(merchant,approval(next));assert.notEqual(replacement.offerId,f.issued.offerId);assert.notEqual(replacement.offerHash,f.issued.offerHash);
 assert.equal((await f.engine.participantStatus(replacement.offerId,f.x.actors[0].userId)).canAccept,true);
 assert.equal((await bookings.offer(f.x.actors[0],f.issued.offerId)).canReopen,false);await release(replacement.offerId);
});
test('participant cancellation requests require studio review and are private and naturally deduplicated',async()=>{
 const f=await funded(),cmd=f.command(f.x.actors[0]);
 await assert.rejects(f.engine.requestCancellation({...cmd,actorId:actor().userId}),/NOT_A_MEMBER/);
 await f.engine.requestCancellation(cmd);await f.engine.requestCancellation({...cmd,commandId:randomUUID()});
 assert.equal((await bookings.offer(f.x.actors[0],f.issued.offerId)).cancellationRequested,true);
 const other=await bookings.offer(f.x.actors[1],f.issued.offerId);assert.equal(other.cancellationRequested,false);assert.equal(other.cancellationRequestCount,null);
 assert.equal((await bookings.offer(merchant,f.issued.offerId)).cancellationRequestCount,1);
 assert.equal((await pool.query("SELECT count(*) FROM payment_events WHERE offer_id=$1 AND event_type='CANCELLATION_REQUESTED'",[f.issued.offerId])).rows[0].count,'1');
 assert.equal((await bookings.offer(merchant,f.issued.offerId)).booking,'SETTLING');
 await f.engine.cancelByMerchant({...f.command(merchant),agreesToFullRefund:true});await settle(f.engine,f.issued.offerId);
 assert.deepEqual(f.provider.financialEffects,{captures:0,refunds:0,voids:6});
});
test('a capture already in flight when the studio cancels is reconciled and refunded without confirmation',async()=>{
 const f=await funded();await f.engine.step(f.issued.offerId);assert.equal(f.provider.financialEffects.captures,1);
 let entered!:()=>void,finish!:()=>void;
 const dispatched=new Promise<void>(r=>entered=r),resume=new Promise<void>(r=>finish=r),execute=f.provider.execute.bind(f.provider);
 f.provider.execute=async op=>{if(op.kind==='CAPTURE'){entered();await resume;}return execute(op);};
 const inFlight=f.engine.step(f.issued.offerId);await dispatched;
 await f.engine.cancelByMerchant({...f.command(merchant),agreesToFullRefund:true});
 assert.equal((await bookings.offer(f.x.actors[0],f.issued.offerId)).canReopen,false);
 finish();await inFlight;await settle(f.engine,f.issued.offerId);
 assert.deepEqual(f.provider.financialEffects,{captures:2,refunds:2,voids:4});
 const view=await bookings.offer(f.x.actors[0],f.issued.offerId);assert.equal(view.booking,'CANCELED');assert.equal(view.cleanup,'COMPLETE');assert.equal(view.canReopen,true);
 assert.equal((await pool.query("SELECT count(*) FROM payment_events WHERE offer_id=$1 AND event_type='CONFIRMED'",[f.issued.offerId])).rows[0].count,'0');
});
test('withdrawn offer can reopen only after recovery; unresolved refunds retain the old planning lock',async()=>{
 const f=await funded();await f.engine.step(f.issued.offerId);
 f.provider.pendingKinds.add('REFUND');await f.engine.cancelByMerchant({...f.command(merchant),agreesToFullRefund:true});await settle(f.engine,f.issued.offerId,10);
 const reopen={commandId:randomUUID(),groupId:f.x.g.groupId,offerId:f.issued.offerId,offerHash:f.issued.offerHash,expectedRevision:f.issued.revision,acknowledgesNewApprovals:true};
 await assert.rejects(bookings.reopen(f.x.actors[0],reopen),/PAYMENT_RECOVERY_REQUIRED/);
 const captured=(await pool.query('SELECT user_id FROM offer_members WHERE offer_id=$1 ORDER BY ordinal LIMIT 1',[f.issued.offerId])).rows[0];
 assert.equal((await f.engine.participantStatus(f.issued.offerId,captured.user_id)).payment,'REFUND_IN_PROGRESS');
 f.provider.pendingKinds.delete('REFUND');const refund=(await pool.query("SELECT request_id FROM payment_operations WHERE offer_id=$1 AND kind='REFUND'",[f.issued.offerId])).rows[0];
 const observed=f.provider.results.get(refund.request_id)!;f.provider.results.set(refund.request_id,{...observed,outcome:'success',status:'COMPLETED'});
 await settle(f.engine,f.issued.offerId);await bookings.reopen(f.x.actors[0],reopen);
 const x=await setup(),r=await request(x),issued=await bookings.approve(merchant,approval(r)),engine=new PaymentEngine(pool,new SimulatedProvider());
 await engine.withdraw({commandId:randomUUID(),actorId:x.actors[1].userId,offerId:issued.offerId,offerHash:issued.offerHash});await engine.step(issued.offerId);
 await bookings.reopen(x.actors[0],{commandId:randomUUID(),groupId:x.g.groupId,offerId:issued.offerId,offerHash:issued.offerHash,expectedRevision:issued.revision,acknowledgesNewApprovals:true});
 assert.equal((await intake.roster(x.actors[0],x.g.groupId)).state,'CLOSED');
});
test('cancellation migration reverses only in an empty fixture and preserves populated history',async()=>{
 const temporary=`cancel_migration_${randomUUID().replaceAll('-','')}`;await admin.query(`CREATE SCHEMA ${temporary}`);
 const u=new URL(process.env.TEST_DATABASE_URL??localDatabaseUrl);u.searchParams.set('options',`-c search_path=${temporary},public`);const temp=database(u.toString());
 try{for(const version of ['001_payments','008_cancellations','008_cancellations.down','008_cancellations'])await temp.query(await readFile(new URL('../db/'+version+'.sql',import.meta.url),'utf8'));
 assert.equal((await temp.query('SELECT count(*) FROM cancellation_requests')).rows[0].count,'0');
 }finally{await temp.end();await admin.query(`DROP SCHEMA ${temporary} CASCADE`);}
 const x=await setup(),r=await request(x),issued=await bookings.approve(merchant,approval(r));
 await new PaymentEngine(pool,new SimulatedProvider()).cancelByMerchant({commandId:randomUUID(),actorId:merchant.userId,offerId:issued.offerId,offerHash:issued.offerHash,agreesToFullRefund:true});
 await assert.rejects(pool.query(await readFile(new URL('../db/008_cancellations.down.sql',import.meta.url),'utf8')),{code:'23514'});
});
test('studio booking history is bounded and exposes actionable states without private participant details',async()=>{
 let newest!:Awaited<ReturnType<typeof bookings.approve>>,x!:Awaited<ReturnType<typeof setup>>;
 for(let i=0;i<21;i++){x=await setup();const r=await request(x);newest=await bookings.approve(merchant,approval(r));await release(newest.offerId);}
 const issued=newest;
 await assert.rejects(bookings.merchantBookings(x.actors[0]),/NOT_FOUND/);
 await assert.rejects(bookings.merchantBookings(merchant,randomUUID()),/NOT_FOUND/);
 const page=await bookings.merchantBookings(merchant);assert.equal(page.bookings.length,20);assert.ok(page.nextCursor);assert.equal(page.bookings[0].offerId,issued.offerId);
 assert.ok(!JSON.stringify(page).includes('budget'));assert.ok(!JSON.stringify(page).includes('Private words'));assert.ok(!JSON.stringify(page).includes(x.actors[0].userId));
 if(page.nextCursor){const next=await bookings.merchantBookings(merchant,page.nextCursor);assert.ok(next.bookings.every(b=>!page.bookings.some(a=>a.offerId===b.offerId)));}
 await release(issued.offerId);
});
