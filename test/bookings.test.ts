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
const migrations=['001_payments','004_private_intake','005_collection_consent','006_merchant_offers','007_clarifications','008_cancellations','013_payment_evidence','014_studio_declines'];
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
 const issuedContext=await intake.participantContext(x.actors[0],x.g.groupId);assert.equal(issuedContext.studioReviewPending,false);assert.equal(issuedContext.offerId,approved.offerId);assert.equal(issuedContext.bookingState,'OPEN');const openIndex=(await intake.plans(x.actors[1])).plans.find(p=>p.groupId===x.g.groupId)!;assert.equal(openIndex.offerId,approved.offerId);assert.equal(openIndex.bookingState,'OPEN');assert.equal(openIndex.ownReady,true);
 assert.deepEqual(await new BookingService(pool).approve(merchant,command),approved);
 const view=await bookings.offer(x.actors[0],approved.offerId);assert.equal(view.isParticipant,true);assert.equal(view.isMerchant,false);const merchantView=await bookings.offer(merchant,approved.offerId);assert.equal(merchantView.isParticipant,false);assert.equal(merchantView.isMerchant,true);assert.equal(view.booking,'OPEN');assert.equal(openIndex.deadline,view.snapshot.deadline);assert.equal(view.snapshot.candidate.amountMinor,4800);assert.equal(view.snapshot.roster.length,6);
 assert.equal(Date.parse(view.snapshot.deadline)-Date.parse(view.snapshot.openedAt),7200000);assert.equal(Date.parse(view.snapshot.reservationEnd)-Date.parse(view.snapshot.deadline),1800000);
 assert.equal(Date.parse(view.snapshot.candidate.startAt)-Date.parse(view.snapshot.reservation.occupiedStart),15*60000);
 assert.equal(Date.parse(view.snapshot.reservation.occupiedEnd)-Date.parse(view.snapshot.candidate.endAt),20*60000);
 assert.ok(!JSON.stringify(view).includes('budgetMinor'));assert.ok(!JSON.stringify(view).includes(x.actors[0].userId));
 const provider=new SimulatedProvider(),engine=new PaymentEngine(pool,provider,{reconcileDelayMs:0});
 for(const a of x.actors){await engine.accept({commandId:randomUUID(),actorId:a.userId,offerId:approved.offerId,offerHash:approved.offerHash});await engine.step(approved.offerId);}
 for(const a of x.actors){await engine.authorize({commandId:randomUUID(),actorId:a.userId,offerId:approved.offerId,offerHash:approved.offerHash});await engine.step(approved.offerId);}
 assert.equal((await bookings.offer(x.actors[0],approved.offerId)).booking,'SETTLING');await settle(engine,approved.offerId);
 assert.equal((await bookings.offer(merchant,approved.offerId)).booking,'CONFIRMED');const planIndex=(await intake.plans(x.actors[0])).plans.find(p=>p.groupId===x.g.groupId)!;assert.equal(planIndex.bookingState,'CONFIRMED');assert.equal(planIndex.activity,'Hand-build a cup');assert.equal(planIndex.startAt,view.snapshot.candidate.startAt);assert.ok(!JSON.stringify(planIndex).includes('Private words'));assert.equal((await intake.participantContext(x.actors[0],x.g.groupId)).bookingState,'CONFIRMED');assert.equal(provider.financialEffects.captures,6);
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
 assert.equal((await intake.participantContext(x.actors[0],x.g.groupId)).studioReviewNeedsRefresh,false);
 const saved=await intake.save(x.actors[1],{commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:r.revision,expectedPreferenceId:x.preferenceIds[1],preference:{...preference,budgetMinor:9000},optionalText:null});
 assert.equal((await bookings.merchantRequest(merchant,r.requestId)).state,'STALE');await assert.rejects(bookings.approve(merchant,approval(r)),/STALE_PLANNING/);
 for(const actor of x.actors){const context=await intake.participantContext(actor,x.g.groupId);assert.equal(context.studioReviewNeedsRefresh,true);assert.equal(context.studioReviewPending,false);assert.equal(context.studioDecline,null);const index=(await intake.plans(actor)).plans.find(p=>p.groupId===x.g.groupId)!;assert.equal(index.studioReviewNeedsRefresh,true);for(const forbidden of ['Private words','budgetMinor','optionalText','preferenceId'])assert.ok(!JSON.stringify(index).includes(forbidden));}
 await intake.plan(x.actors[0],x.g.groupId);assert.equal((await intake.participantContext(x.actors[2],x.g.groupId)).studioReviewNeedsRefresh,true);
 const fresh=await bookings.request(x.actors[0],{commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:saved.revision,offeringId:'handbuild',slotId:'thu-evening'});
 assert.equal((await intake.participantContext(x.actors[2],x.g.groupId)).studioReviewNeedsRefresh,false);assert.equal((await intake.plans(x.actors[2])).plans.find(p=>p.groupId===x.g.groupId)!.studioReviewNeedsRefresh,false);
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
 await temp.query(await readFile(new URL('../db/013_payment_evidence.down.sql',import.meta.url),'utf8'));
 await temp.query(await readFile(new URL('../db/006_merchant_offers.down.sql',import.meta.url),'utf8'));await temp.query(await readFile(new URL('../db/006_merchant_offers.sql',import.meta.url),'utf8'));
 await temp.query(await readFile(new URL('../db/013_payment_evidence.sql',import.meta.url),'utf8'));
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
 assert.equal((await intake.participantContext(f.x.actors[0],f.x.g.groupId)).previousOfferId,null);
 assert.equal((await intake.plans(f.x.actors[1])).plans.find(p=>p.groupId===f.x.g.groupId)!.previousOfferId,null);
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
 const after=await bookings.offer(f.x.actors[0],f.issued.offerId);assert.deepEqual(after.snapshot,before.snapshot);assert.equal(after.canReopen,true);assert.equal(after.isCurrentRound,true);
 await assert.rejects(bookings.reopen(f.x.actors[1],{...reopen,commandId:randomUUID()}),/NOT_FOUND/);
 const savedDetails=await Promise.all(f.x.actors.map(a=>intake.ownPreferences(a,f.x.g.groupId)));
 const reopened=await bookings.reopen(f.x.actors[0],reopen);assert.deepEqual(await bookings.reopen(f.x.actors[0],reopen),reopened);
 for(const [i,a] of f.x.actors.entries()){
  const context=await intake.participantContext(a,f.x.g.groupId),index=(await intake.plans(a)).plans.find(p=>p.groupId===f.x.g.groupId)!;
  assert.equal(context.previousOfferId,f.issued.offerId);assert.equal(context.offerId,null);assert.equal(index.previousOfferId,f.issued.offerId);assert.equal(index.offerId,null);
  assert.deepEqual(await intake.ownPreferences(a,f.x.g.groupId),savedDetails[i]);
  for(const forbidden of ['Private words','budgetMinor','payment_operations','provider_id'])assert.ok(!JSON.stringify(index).includes(forbidden));
 }
 await assert.rejects(intake.participantContext(actor(),f.x.g.groupId),/NOT_FOUND/);assert.equal((await intake.plans(actor())).plans.length,0);
 for(const a of [f.x.actors[0],f.x.actors[1],merchant]){const historical=await bookings.offer(a,f.issued.offerId);assert.equal(historical.isCurrentRound,false);assert.equal(historical.canReopen,false);assert.deepEqual(historical.snapshot,before.snapshot);}
 const next=await bookings.request(f.x.actors[0],{commandId:randomUUID(),groupId:f.x.g.groupId,expectedRevision:reopened.revision,offeringId:'handbuild',slotId:'thu-evening'});
 const replacement=await bookings.approve(merchant,approval(next));assert.notEqual(replacement.offerId,f.issued.offerId);assert.notEqual(replacement.offerHash,f.issued.offerHash);
 assert.equal((await f.engine.participantStatus(replacement.offerId,f.x.actors[0].userId)).canAccept,true);
 assert.equal((await bookings.offer(f.x.actors[1],replacement.offerId)).isCurrentRound,true);assert.equal((await bookings.offer(f.x.actors[1],f.issued.offerId)).isCurrentRound,false);
 assert.equal((await bookings.offer(f.x.actors[0],f.issued.offerId)).canReopen,false);
 assert.equal((await intake.participantContext(f.x.actors[1],f.x.g.groupId)).offerId,replacement.offerId);
 assert.equal((await intake.participantContext(f.x.actors[1],f.x.g.groupId)).previousOfferId,f.issued.offerId);
 assert.equal((await intake.plans(f.x.actors[1])).plans.find(p=>p.groupId===f.x.g.groupId)!.previousOfferId,f.issued.offerId);
 await f.engine.withdraw({commandId:randomUUID(),actorId:f.x.actors[1].userId,offerId:replacement.offerId,offerHash:replacement.offerHash});await settle(f.engine,replacement.offerId);
 await bookings.reopen(f.x.actors[0],{commandId:randomUUID(),groupId:f.x.g.groupId,offerId:replacement.offerId,offerHash:replacement.offerHash,expectedRevision:replacement.revision,acknowledgesNewApprovals:true});
 for(const a of f.x.actors){assert.equal((await intake.participantContext(a,f.x.g.groupId)).previousOfferId,replacement.offerId);assert.equal((await intake.plans(a)).plans.find(p=>p.groupId===f.x.g.groupId)!.previousOfferId,replacement.offerId);}
 await release(replacement.offerId);
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
 for(const actor of f.x.actors){const plan=(await intake.plans(actor)).plans.find(p=>p.groupId===f.x.g.groupId)!;assert.equal(plan.bookingCleanup,'RUNNING');assert.equal(plan.bookingState,'CANCELED');for(const forbidden of ['Private words','budgetMinor','payment_operations','provider_id','REFUND_IN_PROGRESS'])assert.ok(!JSON.stringify(plan).includes(forbidden));}
 f.provider.pendingKinds.delete('REFUND');const refund=(await pool.query("SELECT request_id FROM payment_operations WHERE offer_id=$1 AND kind='REFUND'",[f.issued.offerId])).rows[0];
 const observed=f.provider.results.get(refund.request_id)!;f.provider.results.set(refund.request_id,{...observed,outcome:'success',status:'COMPLETED'});
 await settle(f.engine,f.issued.offerId);for(const actor of f.x.actors)assert.equal((await intake.plans(actor)).plans.find(p=>p.groupId===f.x.g.groupId)!.bookingCleanup,'COMPLETE');await bookings.reopen(f.x.actors[0],reopen);assert.equal((await intake.plans(f.x.actors[0])).plans.find(p=>p.groupId===f.x.g.groupId)!.bookingCleanup,null);
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

async function pendingRefunds(){
 const f=await funded();await settle(f.engine,f.issued.offerId);f.provider.pendingKinds.add('REFUND');
 await f.engine.cancelByMerchant({...f.command(merchant),agreesToFullRefund:true});
 // Defer each observed pending refund so every member reaches the same controlled
 // simulation state; this is not PayPal or hosted failure evidence.
 for(let i=0;i<6;i++){await f.engine.step(f.issued.offerId);await pool.query("UPDATE payment_operations SET next_check_at=clock_timestamp()+interval '10 minutes' WHERE offer_id=$1 AND kind='REFUND' AND state='PENDING'",[f.issued.offerId]);}
 const ops=(await pool.query("SELECT * FROM payment_operations WHERE offer_id=$1 AND kind='REFUND' ORDER BY created_at,id",[f.issued.offerId])).rows;
 assert.equal(ops.length,6);assert.ok(ops.every(o=>o.state==='PENDING'));return {...f,ops};
}
test('studio exceptions separate refund verification from uncertain charges without leaking private data',async()=>{
 const f=await pendingRefunds(),page=await bookings.merchantExceptions(merchant),item=page.exceptions.find(e=>e.offerId===f.issued.offerId)!;
 assert.equal(item.booking,'CANCELED');assert.equal(item.awaitingVerifiedRefundMinor,28800);assert.equal(item.uncertainCaptureMinor,0);assert.equal(item.authorizationAwaitingReleaseMinor,0);
 assert.equal(item.operations.length,6);assert.ok(item.operations.every(o=>o.kind==='REFUND'&&o.canCheck));
 assert.equal(item.operations.find(o=>o.operationId===f.ops[0].id)!.providerReference,f.ops[0].provider_id);
 const original=(await pool.query("SELECT provider_id FROM payment_operations WHERE member_id=$1 AND kind='CAPTURE'",[f.ops[0].member_id])).rows[0];
 assert.equal(item.operations.find(o=>o.operationId===f.ops[0].id)!.originalProviderReference,original.provider_id);
 const text=JSON.stringify(page);for(const secret of ['budgetMinor','Private words',f.ops[0].request_id,f.x.actors[0].userId,'payload','approval_url','payer_id'])assert.ok(!text.includes(secret));
 const providerCalls=f.provider.calls.length,op=f.ops[0],command={commandId:randomUUID(),offerId:f.issued.offerId,operationId:op.id};
 const results=await Promise.all([bookings.checkMerchantPayment(merchant,command),bookings.checkMerchantPayment(merchant,command)]);assert.deepEqual(results[0],results[1]);
 assert.equal((await pool.query("SELECT count(*) FROM payment_events WHERE offer_id=$1 AND event_type='MERCHANT_CHECK_REQUESTED'",[f.issued.offerId])).rows[0].count,'1');
 const after=(await pool.query('SELECT * FROM payment_operations WHERE id=$1',[op.id])).rows[0];
 for(const field of ['id','request_id','payload_hash','state','provider_id','retry_until','dispatched_at','lease_token','lease_until','attempts'])assert.deepEqual(after[field],op[field]);
 assert.deepEqual(after.payload,op.payload);assert.ok(after.next_check_at<op.next_check_at);assert.equal(f.provider.calls.length,providerCalls);
 f.provider.results.set(op.request_id,{...f.provider.results.get(op.request_id)!,outcome:'success',status:'COMPLETED'});
 await f.engine.step(f.issued.offerId);assert.equal(f.provider.calls.length,providerCalls);
 const remaining=(await bookings.merchantExceptions(merchant)).exceptions.find(e=>e.offerId===f.issued.offerId)!;assert.equal(remaining.awaitingVerifiedRefundMinor,24000);assert.equal(remaining.operations.length,5);
 await assert.rejects(bookings.checkMerchantPayment(merchant,{...command,commandId:randomUUID()}),/PAYMENT_CHECK_UNAVAILABLE/);
});
test('exception reads and check commands reject participants, foreign workspaces and fabricated fields',async()=>{
 const f=await pendingRefunds(),command={commandId:randomUUID(),offerId:f.issued.offerId,operationId:f.ops[0].id};
 await assert.rejects(bookings.merchantExceptions(f.x.actors[0]),/NOT_FOUND/);
 await assert.rejects(bookings.checkMerchantPayment(f.x.actors[0],command),/NOT_FOUND/);
 await assert.rejects(bookings.checkMerchantPayment({...merchant,emailVerified:false},command),/VERIFIED_IDENTITY_REQUIRED/);
 const wrongWorkspace={...merchant,demoWorkspaceId:randomUUID()};assert.equal((await bookings.merchantExceptions(wrongWorkspace)).exceptions.length,0);
 await assert.rejects(bookings.merchantExceptions(wrongWorkspace,f.issued.offerId),/NOT_FOUND/);
 await assert.rejects(bookings.checkMerchantPayment(wrongWorkspace,command),/NOT_FOUND/);
 await assert.rejects(bookings.checkMerchantPayment(merchant,{...command,operationId:randomUUID()}),/NOT_FOUND/);
 await assert.rejects(bookings.checkMerchantPayment(merchant,{...command,state:'SUCCEEDED'}));
 await assert.rejects(bookings.merchantExceptions(merchant,'invented'));
});
test('studio checks respect active leases and never reopen an operation inside a replay window',async()=>{
 const f=await pendingRefunds(),op=f.ops[0],command=()=>({commandId:randomUUID(),offerId:f.issued.offerId,operationId:op.id});
 await pool.query("UPDATE payment_operations SET lease_token=$2,lease_until=clock_timestamp()+interval '45 seconds' WHERE id=$1",[op.id,randomUUID()]);
 await assert.rejects(bookings.checkMerchantPayment(merchant,command()),/PAYMENT_CHECK_UNAVAILABLE/);
 assert.equal((await bookings.merchantExceptions(merchant)).exceptions.find(e=>e.offerId===f.issued.offerId)!.operations.find(o=>o.operationId===op.id)!.canCheck,false);
 await pool.query("UPDATE payment_operations SET lease_until=NULL,lease_token=NULL,state='UNKNOWN',retry_until=clock_timestamp()+interval '10 minutes' WHERE id=$1",[op.id]);
 await assert.rejects(bookings.checkMerchantPayment(merchant,command()),/PAYMENT_CHECK_UNAVAILABLE/);
 await pool.query("UPDATE payment_operations SET retry_until=clock_timestamp()-interval '1 second' WHERE id=$1",[op.id]);
 const before=(await pool.query('SELECT * FROM payment_operations WHERE id=$1',[op.id])).rows[0],calls=f.provider.calls.length;
 await bookings.checkMerchantPayment(merchant,command());f.provider.results.delete(op.request_id);await f.engine.step(f.issued.offerId);
 assert.equal(f.provider.calls.length,calls);const after=(await pool.query('SELECT * FROM payment_operations WHERE id=$1',[op.id])).rows[0];assert.equal(after.state,'ACTION_REQUIRED');assert.equal(after.request_id,before.request_id);assert.deepEqual(after.retry_until,before.retry_until);assert.deepEqual(after.payload,before.payload);
});
test('definitive refund rejection remains a studio exception with its amount and no replay button',async()=>{
 const f=await pendingRefunds(),op=f.ops[0];await pool.query("UPDATE payment_operations SET state='FAILED',provider_status='FAILED' WHERE id=$1",[op.id]);
 const item=(await bookings.merchantExceptions(merchant)).exceptions.find(e=>e.offerId===f.issued.offerId)!,rejected=item.operations.find(o=>o.operationId===op.id)!;
 assert.equal(item.awaitingVerifiedRefundMinor,28800);assert.equal(rejected.state,'FAILED');assert.equal(rejected.canCheck,false);
 await assert.rejects(bookings.checkMerchantPayment(merchant,{commandId:randomUUID(),offerId:f.issued.offerId,operationId:op.id}),/PAYMENT_CHECK_UNAVAILABLE/);
 assert.equal((await pool.query('SELECT state FROM payment_operations WHERE id=$1',[op.id])).rows[0].state,'FAILED');
 await f.engine.step(f.issued.offerId);assert.equal((await intake.plans(f.x.actors[0])).plans.find(p=>p.groupId===f.x.g.groupId)!.bookingCleanup,'ACTION_REQUIRED');
});
test('uncertain capture amounts never imply a completed charge or duplicate an authorization total',async()=>{
 const f=await funded();await f.engine.step(f.issued.offerId);
 const captured=(await pool.query("SELECT * FROM payment_operations WHERE offer_id=$1 AND kind='CAPTURE'",[f.issued.offerId])).rows[0];
 await pool.query("UPDATE payment_operations SET state='ACTION_REQUIRED' WHERE id=$1",[captured.id]);
 const item=(await bookings.merchantExceptions(merchant)).exceptions.find(e=>e.offerId===f.issued.offerId)!;assert.equal(item.uncertainCaptureMinor,4800);assert.equal(item.awaitingVerifiedRefundMinor,0);assert.equal(item.authorizationAwaitingReleaseMinor,0);assert.equal(item.booking,'SETTLING');
 await f.engine.cancelByMerchant({...f.command(merchant),agreesToFullRefund:true});await pool.query("UPDATE payment_operations SET state='SUCCEEDED' WHERE id=$1",[captured.id]);await settle(f.engine,f.issued.offerId);
});
test('exception pagination stays bounded and a resolved cursor still locates older work',async()=>{
 const owner=actor(),cat={...catalog,studioId:'exceptions-studio',versionId:'exceptions-v1',studioName:'Exceptions studio'};
 await pool.query('INSERT INTO merchant_studios VALUES($1,$2,$3,$4,$5,$6)',[cat.studioId,owner.userId,'exceptions_merchant','exceptions-exclusive',15,20]);
 await pool.query('INSERT INTO merchant_catalog_versions(studio_id,version_id,catalog) VALUES($1,$2,$3)',[cat.studioId,cat.versionId,JSON.stringify(cat)]);
 const ids:string[]=[];
 for(let i=0;i<21;i++){const x=await setup(cat),r=await request(x),issued=await bookings.approve(owner,approval(r)),engine=new PaymentEngine(pool,new SimulatedProvider());
  const accepted=await engine.accept({commandId:randomUUID(),actorId:x.actors[0].userId,offerId:issued.offerId,offerHash:issued.offerHash});
  await pool.query("UPDATE payment_operations SET state='ACTION_REQUIRED',dispatched_at=clock_timestamp() WHERE id=$1",[accepted.operationId]);ids.push(issued.offerId);await release(issued.offerId);
 }
 const page=await bookings.merchantExceptions(owner);assert.equal(page.exceptions.length,20);assert.equal(page.exceptions[0].offerId,ids.at(-1));assert.ok(page.nextCursor);
 await assert.rejects(bookings.merchantExceptions(merchant,page.nextCursor),/NOT_FOUND/);
 await pool.query("UPDATE payment_operations SET state='FAILED' WHERE offer_id=$1",[page.nextCursor]);
 const next=await bookings.merchantExceptions(owner,page.nextCursor);assert.equal(next.exceptions.length,1);assert.equal(next.exceptions[0].offerId,ids[0]);assert.equal(next.nextCursor,null);
});

const evidenceCommand=(operationId:string,overrides:Record<string,unknown>={})=>({commandId:randomUUID(),operationId,expectedOperationState:'PENDING',source:'TRANSACTION',reference:'REPORT-123',reportedOutcome:'COMPLETED',...overrides});
async function financialState(offerId:string){return {
 operations:(await pool.query('SELECT * FROM payment_operations WHERE offer_id=$1 ORDER BY id',[offerId])).rows,
 offer:(await pool.query('SELECT * FROM offers WHERE id=$1',[offerId])).rows,
 reservation:(await pool.query('SELECT * FROM reservations WHERE offer_id=$1',[offerId])).rows,
};}
test('studio completed reports never change payment truth, financial work or an active worker lease',async()=>{
 const f=await pendingRefunds(),op=f.ops[0];
 await pool.query("UPDATE payment_operations SET lease_token=$2,lease_until=clock_timestamp()+interval '45 seconds' WHERE id=$1",[op.id,randomUUID()]);
 const before=await financialState(f.issued.offerId),calls=f.provider.calls.length,effects=structuredClone(f.provider.financialEffects);
 const result=await bookings.recordMerchantPaymentEvidence(merchant,evidenceCommand(op.id));
 assert.deepEqual(await financialState(f.issued.offerId),before);assert.equal(f.provider.calls.length,calls);assert.deepEqual(f.provider.financialEffects,effects);
 const page=await bookings.merchantPaymentRecord(merchant,op.id);assert.equal(page.state,'PENDING');assert.equal(page.booking,'CANCELED');assert.equal(page.records[0].reportedOutcome,'COMPLETED');
 assert.equal(page.records[0].operationStateAtRecording,'PENDING');assert.equal(page.records[0].id,result.evidenceId);assert.equal(page.providerReference,op.provider_id);
 const original=(await pool.query("SELECT provider_id FROM payment_operations WHERE member_id=$1 AND kind='CAPTURE'",[op.member_id])).rows[0];assert.equal(page.originalProviderReference,original.provider_id);
 const events=(await pool.query("SELECT * FROM payment_events WHERE operation_id=$1 AND event_type='STUDIO_EVIDENCE_RECORDED'",[op.id])).rows;
 assert.equal(events.length,1);assert.equal(events[0].state,'CANCELED');
 for(const secret of ['recorded_by','budgetMinor','Private words',op.request_id,merchant.userId,f.x.actors[0].userId,'payload','approval_url','payer_id'])assert.ok(!JSON.stringify(page).includes(secret));
 assert.deepEqual((await pool.query('SELECT result FROM intake_commands WHERE id=$1',[result.evidenceId])).rows[0].result,{evidenceId:result.evidenceId});
});
test('studio evidence concurrent retries and canonical references append one report and one audit event',async()=>{
 const f=await pendingRefunds(),op=f.ops[0],command=evidenceCommand(op.id,{reference:' report-123 '});
 const results=await Promise.all([bookings.recordMerchantPaymentEvidence(merchant,command),new BookingService(pool).recordMerchantPaymentEvidence(merchant,command)]);
 assert.deepEqual(results[0],results[1]);
 assert.deepEqual(await bookings.recordMerchantPaymentEvidence(merchant,{...command,reference:'REPORT-123'}),results[0]);
 const fresh=await Promise.all([bookings.recordMerchantPaymentEvidence(merchant,{...command,commandId:randomUUID()}),bookings.recordMerchantPaymentEvidence(merchant,{...command,commandId:randomUUID()})]);
 assert.ok(fresh.every(r=>r.evidenceId===results[0].evidenceId));
 assert.equal((await bookings.merchantPaymentRecord(merchant,op.id)).records.length,1);
 assert.equal((await pool.query("SELECT count(*) FROM payment_events WHERE operation_id=$1 AND event_type='STUDIO_EVIDENCE_RECORDED'",[op.id])).rows[0].count,'1');
 await assert.rejects(bookings.recordMerchantPaymentEvidence(merchant,{...command,reportedOutcome:'FAILED'}),/COMMAND_CONFLICT/);
 const changed=await bookings.recordMerchantPaymentEvidence(merchant,evidenceCommand(op.id,{reportedOutcome:'FAILED'}));
 assert.notEqual(changed.evidenceId,results[0].evidenceId);assert.equal((await bookings.merchantPaymentRecord(merchant,op.id)).records.length,2);
});
test('studio evidence rejects participants, foreign owners, workspaces, operations and cursors',async()=>{
 const f=await pendingRefunds(),command=evidenceCommand(f.ops[0].id),saved=await bookings.recordMerchantPaymentEvidence(merchant,command);
 for(const a of [f.x.actors[0],actor(),{...merchant,demoWorkspaceId:randomUUID()}]){
  await assert.rejects(bookings.merchantPaymentRecord(a,f.ops[0].id),/NOT_FOUND/);
  await assert.rejects(bookings.recordMerchantPaymentEvidence(a,{...command,commandId:randomUUID()}),/NOT_FOUND/);
 }
 await assert.rejects(bookings.recordMerchantPaymentEvidence({...merchant,emailVerified:false},command),/VERIFIED_IDENTITY_REQUIRED/);
 await assert.rejects(bookings.merchantPaymentRecord({...merchant,emailVerified:false},f.ops[0].id),/VERIFIED_IDENTITY_REQUIRED/);
 await assert.rejects(bookings.recordMerchantPaymentEvidence(merchant,evidenceCommand(randomUUID())),/NOT_FOUND/);
 await assert.rejects(bookings.merchantPaymentRecord(merchant,randomUUID()),/NOT_FOUND/);
 await assert.rejects(bookings.merchantPaymentRecord(merchant,f.ops[1].id,saved.evidenceId),/NOT_FOUND/);
 await assert.rejects(bookings.merchantPaymentRecord(merchant,f.ops[0].id,randomUUID()),/NOT_FOUND/);
 await assert.rejects(bookings.merchantPaymentRecord(merchant,'invented'));
});
test('studio evidence accepts only bounded references and explicit report outcomes with no override fields',async()=>{
 const f=await pendingRefunds(),before=await financialState(f.issued.offerId),command=evidenceCommand(f.ops[0].id);
 for(const reference of ['', 'AB', 'A'.repeat(65), 'person@example.com', 'https://paypal.com/case', 'CASE\n123','CASE 123'])await assert.rejects(bookings.recordMerchantPaymentEvidence(merchant,{...command,reference}));
 for(const extra of [{state:'SUCCEEDED'},{recordedBy:merchant.userId},{amountMinor:1},{optionalText:'Private note'},{reportedOutcome:'SUCCEEDED'},{source:'EMAIL'},{expectedOperationState:'SUCCEEDED'}])await assert.rejects(bookings.recordMerchantPaymentEvidence(merchant,{...command,...extra}));
 assert.equal((await bookings.merchantPaymentRecord(merchant,f.ops[0].id)).records.length,0);assert.deepEqual(await financialState(f.issued.offerId),before);
});
test('studio evidence fences changed and resolved operations while preserving earlier records and replay results',async()=>{
 const f=await pendingRefunds(),op=f.ops[0],command=evidenceCommand(op.id),saved=await bookings.recordMerchantPaymentEvidence(merchant,command);
 await pool.query("UPDATE payment_operations SET state='ACTION_REQUIRED' WHERE id=$1",[op.id]);
 await assert.rejects(bookings.recordMerchantPaymentEvidence(merchant,evidenceCommand(op.id,{reference:'NEW-123'})),/PAYMENT_EVIDENCE_STALE/);
 const before=await financialState(f.issued.offerId);
 await bookings.recordMerchantPaymentEvidence(merchant,evidenceCommand(op.id,{expectedOperationState:'ACTION_REQUIRED',source:'SUPPORT_CASE',reference:'CASE-456',reportedOutcome:'UNRESOLVED'}));
 assert.deepEqual(await financialState(f.issued.offerId),before);
 await pool.query("UPDATE payment_operations SET state='SUCCEEDED',provider_status='COMPLETED' WHERE id=$1",[op.id]);
 assert.deepEqual(await new BookingService(pool).recordMerchantPaymentEvidence(merchant,command),saved);
 await assert.rejects(bookings.recordMerchantPaymentEvidence(merchant,evidenceCommand(op.id)),/PAYMENT_EVIDENCE_STALE/);
 const page=await bookings.merchantPaymentRecord(merchant,op.id);assert.equal(page.canRecord,false);assert.equal(page.state,'SUCCEEDED');assert.equal(page.records.length,2);
 assert.ok((await bookings.offer(merchant,f.issued.offerId)).paymentRecords.some(r=>r.operationId===op.id));
 assert.deepEqual((await bookings.offer(f.x.actors[0],f.issued.offerId)).paymentRecords,[]);
 assert.ok(!(await bookings.merchantExceptions(merchant)).exceptions.find(e=>e.offerId===f.issued.offerId)!.operations.some(o=>o.operationId===op.id));
});
test('studio evidence cannot mark an uncertain capture complete or create a charge for an undispatched checkout',async()=>{
 const f=await funded();await f.engine.step(f.issued.offerId);
 const op=(await pool.query("SELECT * FROM payment_operations WHERE offer_id=$1 AND kind='CAPTURE'",[f.issued.offerId])).rows[0];
 await pool.query("UPDATE payment_operations SET state='UNKNOWN' WHERE id=$1",[op.id]);const before=await financialState(f.issued.offerId),effects=structuredClone(f.provider.financialEffects);
 await bookings.recordMerchantPaymentEvidence(merchant,evidenceCommand(op.id,{expectedOperationState:'UNKNOWN'}));
 assert.deepEqual(await financialState(f.issued.offerId),before);assert.deepEqual(f.provider.financialEffects,effects);assert.equal((await bookings.offer(merchant,f.issued.offerId)).booking,'SETTLING');
 // An operation without any dispatch has no provider observation to reconcile.
 await pool.query("UPDATE payment_operations SET dispatched_at=NULL WHERE id=$1",[op.id]);
 await assert.rejects(bookings.recordMerchantPaymentEvidence(merchant,evidenceCommand(op.id,{expectedOperationState:'UNKNOWN',reference:'NEW-123'})),/PAYMENT_EVIDENCE_UNAVAILABLE/);
 await f.engine.cancelByMerchant({...f.command(merchant),agreesToFullRefund:true});await pool.query("UPDATE payment_operations SET state='SUCCEEDED' WHERE id=$1",[op.id]);await settle(f.engine,f.issued.offerId);
});
test('studio evidence keeps rejected refunds actionable without changing their failed result',async()=>{
 const f=await pendingRefunds(),op=f.ops[0];await pool.query("UPDATE payment_operations SET state='FAILED',provider_status='FAILED' WHERE id=$1",[op.id]);
 const before=await financialState(f.issued.offerId);await bookings.recordMerchantPaymentEvidence(merchant,evidenceCommand(op.id,{expectedOperationState:'FAILED',source:'SUPPORT_CASE'}));
 assert.deepEqual(await financialState(f.issued.offerId),before);assert.equal((await bookings.merchantPaymentRecord(merchant,op.id)).canRecord,true);
 const capture=(await pool.query("SELECT * FROM payment_operations WHERE member_id=$1 AND kind='CAPTURE'",[op.member_id])).rows[0];
 await pool.query("UPDATE payment_operations SET state='FAILED' WHERE id=$1",[capture.id]);
 await assert.rejects(bookings.recordMerchantPaymentEvidence(merchant,evidenceCommand(capture.id,{expectedOperationState:'FAILED'})),/PAYMENT_EVIDENCE_UNAVAILABLE/);
});
test('studio evidence bounds each operation at fifty records and pages through equal timestamps without loss',async()=>{
 const f=await pendingRefunds(),op=f.ops[0],ids=Array.from({length:50},()=>randomUUID()),time=new Date('2026-01-01T00:00:00Z');
 // Equal timestamps exercise the UUID tie-breaker. These are isolated fixtures,
 // with real deferred command linkage and immutable-row constraints.
 for(const [i,id] of ids.entries()){
  await pool.query('INSERT INTO intake_commands VALUES($1,$2,$3,$4)',[id,merchant.userId,'fixture',JSON.stringify({evidenceId:id})]);
  await pool.query("INSERT INTO payment_reconciliation_evidence VALUES($1,$2,$3,'TRANSACTION',$4,'UNRESOLVED','PENDING',$5)",[id,op.id,merchant.userId,`REF-${i}`,time]);
 }
 const page=await bookings.merchantPaymentRecord(merchant,op.id);assert.equal(page.records.length,20);assert.equal(page.canRecord,false);assert.equal(page.recordLimitReached,true);assert.ok(page.nextCursor);
 const second=await bookings.merchantPaymentRecord(merchant,op.id,page.nextCursor),third=await bookings.merchantPaymentRecord(merchant,op.id,second.nextCursor);assert.equal(second.records.length,20);assert.equal(third.records.length,10);assert.equal(third.nextCursor,null);
 assert.deepEqual([...page.records,...second.records,...third.records].map(r=>r.id),ids.toSorted().reverse());
 await assert.rejects(bookings.recordMerchantPaymentEvidence(merchant,evidenceCommand(op.id,{reference:'REF-51'})),/PAYMENT_EVIDENCE_LIMIT/);
 // Semantic retries are allowed at the cap, without creating additional records.
 const dedupe=await bookings.recordMerchantPaymentEvidence(merchant,evidenceCommand(op.id,{reference:'REF-0',reportedOutcome:'UNRESOLVED'}));assert.equal(dedupe.evidenceId,ids[0]);
});
test('studio evidence is immutable, linked to a committed command and cannot be dropped after use',async()=>{
 const f=await pendingRefunds(),op=f.ops[0],saved=await bookings.recordMerchantPaymentEvidence(merchant,evidenceCommand(op.id));
 await assert.rejects(pool.query("UPDATE payment_reconciliation_evidence SET reported_outcome='FAILED' WHERE id=$1",[saved.evidenceId]),{code:'23514'});
 await assert.rejects(pool.query('DELETE FROM payment_reconciliation_evidence WHERE id=$1',[saved.evidenceId]),{code:'23514'});
 await assert.rejects(pool.query("INSERT INTO payment_reconciliation_evidence(id,operation_id,recorded_by,source,reference,reported_outcome,operation_state_at_recording) VALUES($1,$2,$3,'TRANSACTION','ORPHAN-123','UNRESOLVED','PENDING')",[randomUUID(),op.id,merchant.userId]),{code:'23503'});
 await assert.rejects(pool.query(await readFile(new URL('../db/013_payment_evidence.down.sql',import.meta.url),'utf8')),{code:'23514'});
 assert.equal((await bookings.merchantPaymentRecord(merchant,op.id)).records.length,1);
});

test('studio decline returns a group to planning without creating an offer or exposing private needs',async()=>{
 const x=await setup(),r=await request(x),payload={commandId:randomUUID(),requestId:r.requestId,expectedRevision:r.revision,reason:'UNAVAILABLE'};
 await assert.rejects(bookings.decline(x.actors[0],payload),/NOT_FOUND/);
 const result=await bookings.decline(merchant,payload);assert.deepEqual(await new BookingService(pool).decline(merchant,payload),result);
 const context=await intake.participantContext(x.actors[1],x.g.groupId);assert.equal(context.state,'CLOSED');assert.equal(context.offerId,null);assert.equal(context.studioDecline?.reason,'UNAVAILABLE');
 assert.equal((await bookings.merchantRequest(merchant,r.requestId)).state,'DECLINED');
 assert.equal((await bookings.merchantQueue(merchant)).requests.some(q=>q.requestId===r.requestId),false);
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM offer_snapshots WHERE group_id=$1',[x.g.groupId])).rows[0].n,0);
 await assert.rejects(bookings.approve(merchant,approval(r)),/STALE_PLANNING/);
 await assert.rejects(bookings.decline(merchant,{...payload,commandId:randomUUID(),reason:'Private words'}));
 const edited=await intake.save(x.actors[2],{commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:result.revision,expectedPreferenceId:x.preferenceIds[2],preference:{...preference,budgetMinor:5100},optionalText:'Private words never shared'});
 assert.equal((await intake.participantContext(x.actors[1],x.g.groupId)).studioDecline?.reason,'UNAVAILABLE');assert.equal((await intake.plans(x.actors[0])).plans[0].studioDeclined,true);
 assert.equal(context.studioDecline?.activity,'Hand-build a cup');assert.equal(context.studioDecline?.startAt,catalog.slots[0].startAt);const index=(await intake.plans(x.actors[1])).plans[0];assert.equal(index.studioDeclined,true);for(const forbidden of ['Private words','budgetMinor','preferenceId','source_hash'])assert.ok(!JSON.stringify(index).includes(forbidden));

 await intake.plan(x.actors[0],x.g.groupId);assert.equal((await intake.participantContext(x.actors[1],x.g.groupId)).studioDecline?.reason,'UNAVAILABLE');
 const fresh=await bookings.request(x.actors[0],{commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:edited.revision,offeringId:'handbuild',slotId:'thu-evening'});assert.equal((await bookings.merchantRequest(merchant,fresh.requestId)).state,'PENDING');assert.equal((await intake.participantContext(x.actors[1],x.g.groupId)).studioDecline,null);assert.equal((await intake.plans(x.actors[1])).plans[0].studioDeclined,false);
 const invalidated=await intake.save(x.actors[3],{commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:fresh.revision,expectedPreferenceId:x.preferenceIds[3],preference:{...preference,budgetMinor:5200},optionalText:'Private words never shared'});assert.equal((await intake.participantContext(x.actors[1],x.g.groupId)).studioDecline,null);assert.equal((await intake.plans(x.actors[1])).plans[0].studioDeclined,false);
 const newer=await bookings.request(x.actors[0],{commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:invalidated.revision,offeringId:'handbuild',slotId:'thu-evening'});await bookings.decline(merchant,{commandId:randomUUID(),requestId:newer.requestId,expectedRevision:newer.revision,reason:'CANNOT_DELIVER'});assert.equal((await intake.participantContext(x.actors[1],x.g.groupId)).studioDecline?.reason,'CANNOT_DELIVER');
});
test('concurrent studio approval and decline have one decision and never reserve a declined request',async()=>{
 const x=await setup(),r=await request(x);const decisions=await Promise.allSettled([bookings.decline(merchant,{commandId:randomUUID(),requestId:r.requestId,expectedRevision:r.revision,reason:'CANNOT_DELIVER'}),bookings.approve(merchant,approval(r))]);
 assert.equal(decisions.filter(d=>d.status==='fulfilled').length,1);assert.ok(decisions.some(d=>d.status==='rejected'&&d.reason.code==='STALE_PLANNING'));
 const review=await bookings.merchantRequest(merchant,r.requestId);if(review.state==='APPROVED')await release(review.offerId);else{assert.equal(review.state,'DECLINED');assert.equal((await pool.query('SELECT count(*)::int AS n FROM offer_snapshots WHERE request_id=$1',[r.requestId])).rows[0].n,0);}
});
