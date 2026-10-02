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
const migrations=['001_payments','004_private_intake','005_collection_consent','006_merchant_offers','007_clarifications'];
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
