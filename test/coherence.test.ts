import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {StageStrip} from '../app/components/plan-shell.tsx';
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {nextStep,type StepFacts} from '../src/planning/next-step.ts';
import {contextNextStep} from '../app/lib/next-step.ts';
import {invitationToken} from '../app/lib/invitation.ts';
import {database,localDatabaseUrl} from '../src/db.ts';
import {migrationVersions} from '../src/migrations.ts';
import {BookingService} from '../src/bookings/service.ts';
import {IntakeService,type IntakeActor} from '../src/intake/service.ts';
const facts:StepFacts={state:'COLLECTING',isOrganizer:false,ownReady:true,noteNeedsReview:false,pickupAnswer:false,pickupAsk:false,pickupWaiting:false,ownChoicesNeedReview:false,memberCount:6,readyCount:6,allowedSizes:[6,7,8]};
test('next action prioritizes closed financial truth and removal over obsolete planning blockers',()=>{
 for(const booking of ['OPEN','SETTLING','CONFIRMED','EXPIRED','WITHDRAWN','ABORTED','CANCELED','SUPERSEDED',null]){
  const step=nextStep({...facts,offerId:randomUUID(),bookingState:booking,pickupAnswer:true,noteNeedsReview:true,ownReady:false});
  assert.equal(step.kind,booking==='CONFIRMED'?'BOOKED':['OPEN','SETTLING'].includes(booking??'')?'OFFER':'RECOVERY');
  assert.equal(step.stage,booking==='CONFIRMED'?4:3);
 }
 assert.equal(nextStep({...facts,excluded:true,offerId:randomUUID(),bookingState:'OPEN'}).kind,'REMOVED');
 assert.equal(nextStep({...facts,state:'ABANDONED',noteNeedsReview:true}).kind,'ENDED');
});
test('personal requests lead group work; incomplete capacity never closes itself',()=>{
 assert.equal(nextStep({...facts,isOrganizer:true,pickupAnswer:true,noteNeedsReview:true}).kind,'PICKUP_ANSWER');
 assert.equal(nextStep({...facts,isOrganizer:true,noteNeedsReview:true,pickupAsk:true}).kind,'NOTE');
 assert.equal(nextStep({...facts,isOrganizer:true,pickupAsk:true}).kind,'PICKUP_ASK');
 for(const count of [0,1,5,9])assert.notEqual(nextStep({...facts,isOrganizer:true,memberCount:count,readyCount:count}).kind,'CLOSE');
 for(const count of [6,7,8])assert.equal(nextStep({...facts,isOrganizer:true,memberCount:count,readyCount:count}).kind,'CLOSE');
 assert.equal(nextStep({...facts,isOrganizer:true,readyCount:5}).kind,'REMIND');
 assert.equal(nextStep({...facts,state:'MERCHANT_REVIEW'}).kind,'STUDIO_WAIT');
 assert.equal(nextStep({...facts,state:'CLOSED',isOrganizer:true,candidateState:'CANDIDATE_READY'}).kind,'SESSIONS');
 assert.equal(nextStep({...facts,state:'CLOSED',candidateState:'CANDIDATE_READY'}).kind,'FRIENDS_WAIT');
});
test('four roles get deliberate outcomes across the complete planning and offer state matrix',()=>{
 const cases:[Partial<StepFacts>,string,string][]=[
  [{ownReady:false},'DETAILS','DETAILS'],[{pickupAnswer:true},'PICKUP_ANSWER','PICKUP_ANSWER'],
  [{noteNeedsReview:true},'NOTE','NOTE'],[{pickupAsk:true},'PICKUP_ASK','PICKUP_ASK'],
  [{ownChoicesNeedReview:true},'CHOICES','CHOICES'],[{pickupWaiting:true},'PICKUP_WAIT','PICKUP_WAIT'],
  [{},'CLOSE','FRIENDS_WAIT'],[{readyCount:5},'REMIND','FRIENDS_WAIT'],
  [{state:'CLOSED'},'FIND_SESSION','FRIENDS_WAIT'],[{state:'CLOSED',candidateState:'CANDIDATE_READY'},'SESSIONS','FRIENDS_WAIT'],
  [{state:'CLOSED',candidateState:'NEEDS_CLARIFICATION'},'REMIND','FRIENDS_WAIT'],
  [{state:'MERCHANT_REVIEW'},'STUDIO_WAIT','STUDIO_WAIT'],[{state:'OFFER_ISSUED',bookingState:'OPEN'},'OFFER','OFFER'],
  [{state:'OFFER_ISSUED',bookingState:'CONFIRMED'},'BOOKED','BOOKED'],[{state:'OFFER_ISSUED',bookingState:'CANCELED'},'RECOVERY','RECOVERY'],
  [{excluded:true},'REMOVED','REMOVED'],[{state:'ABANDONED'},'ENDED','ENDED']
 ];
 for(const role of ['organizer','friend','requester','collector'])for(const [change,organizer,friend] of cases){
  const step=nextStep({...facts,...change,isOrganizer:role==='organizer'});assert.equal(step.kind,role==='organizer'?organizer:friend,`${role}: ${JSON.stringify(change)}`);
  if(step.kind!=='BOOKED')assert.notEqual(step.stage,4);
 }
});
test('closed sessions do not advertise an active approval step in the progress strip',()=>{
 const closed=renderToStaticMarkup(createElement(StageStrip,{stage:3,ended:true}));assert.ok(!closed.includes('aria-current'));assert.ok(!closed.includes('class="current"'));assert.ok(closed.includes('This session is closed'));
 const booked=renderToStaticMarkup(createElement(StageStrip,{stage:4}));assert.equal((booked.match(/aria-current="step"/g)??[]).length,1);
});
test('invitation context rejects foreign URLs, malformed tokens and arbitrary heading parameters',()=>{
 const token='a'.repeat(64);assert.equal(invitationToken('/join?invite='+token),token);
 for(const value of ['//evil.example/join?invite='+token,'https://evil.example/join?invite='+token,'/groups/new?invite='+token,'/join?invite=example','/join?name=Alex','/join?invite='+token+'x'])assert.equal(invitationToken(value),null);
});
const base=process.env.TEST_DATABASE_URL??localDatabaseUrl,schema=`coherence_${randomUUID().replaceAll('-','')}`,admin=database(base),scoped=new URL(base);scoped.searchParams.set('options',`-c search_path=${schema},public`);const pool=database(scoped.toString()),intake=new IntakeService(pool);
const catalog=JSON.parse(await readFile(new URL('../fixtures/studio.json',import.meta.url),'utf8'));
const preference={budgetMinor:5000,availableSlotIds:['thu-evening'],latestFinishAt:null,technique:'ANY',outcome:'FORM_OWN_CUP',collection:'SELF_LATER',nomineeMemberId:null,extraRequirement:'NONE',unresolvedKeys:[]};
const actor=():IntakeActor=>({userId:randomUUID(),emailVerified:true});
before(async()=>{await admin.query(`CREATE SCHEMA ${schema}`);for(const v of migrationVersions)await pool.query(await readFile(new URL(`../db/${v}.sql`,import.meta.url),'utf8'));});
after(async()=>{await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();});
async function group(count:number){const actors=Array.from({length:count},actor),g=await intake.create(actors[0],{commandId:randomUUID(),displayName:'Alex',catalog}),ids=[g.memberId];
 for(let i=1;i<count;i++)ids.push((await intake.join(actors[i],{commandId:randomUUID(),invite:g.invite,displayName:i===1?'Sam':i===2?'Jordan':`Friend ${i}`})).memberId);
 for(let i=0;i<count;i++)await intake.save(actors[i],{commandId:randomUUID(),groupId:g.groupId,expectedRevision:0,expectedPreferenceId:null,preference,optionalText:null});return {actors,g,ids};}
test('name-only creation accommodates six, seven or eight; closing freezes the actual allowed size',async()=>{
 for(const count of [6,7,8]){const x=await group(count),c=await intake.participantContext(x.actors[0],x.g.groupId),list=(await intake.plans(x.actors[0])).plans[0];assert.equal(c.targetSize,6);assert.deepEqual(list.nextStep,contextNextStep(c));assert.equal(list.nextStep?.kind,'CLOSE');
  await intake.closeRoster(x.actors[0],{commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:c.revision,memberIds:x.ids});
  const closed=await intake.participantContext(x.actors[0],x.g.groupId);assert.equal(closed.targetSize,count);assert.equal((await intake.plan(x.actors[0],x.g.groupId)).result.state,'CANDIDATE_READY');
  assert.deepEqual((await intake.plans(x.actors[0])).plans[0].nextStep,contextNextStep(await intake.participantContext(x.actors[0],x.g.groupId)));
 }
});
test('five-person close and foreign organizer remain rejected after removing the size question',async()=>{
 const x=await group(5),c=await intake.participantContext(x.actors[0],x.g.groupId),p={commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:c.revision,memberIds:x.ids};
 await assert.rejects(intake.closeRoster(x.actors[0],p),/INVALID_ROSTER/);await assert.rejects(intake.closeRoster(x.actors[1],p),/NOT_FOUND/);
 assert.equal((await intake.participantContext(x.actors[0],x.g.groupId)).state,'COLLECTING');
});
test('early pickup appears first in both views; index never contains private fields or raw action identities',async()=>{
 const x=await group(6),sam=await intake.participantContext(x.actors[1],x.g.groupId);
 const saved=await intake.save(x.actors[1],{commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:sam.revision,expectedPreferenceId:sam.preference!.revisionId,preference:{...preference,collection:'NOMINEE_LATER',unresolvedKeys:['COLLECTION']},optionalText:null});
 await intake.nominateCollector(x.actors[1],{commandId:randomUUID(),groupId:x.g.groupId,expectedPreferenceId:saved.preferenceId,nomineeMemberId:x.ids[2],disclosureAgreed:true});
 for(const i of [0,1,2]){const c=await intake.participantContext(x.actors[i],x.g.groupId),plan=(await intake.plans(x.actors[i])).plans[0];assert.deepEqual(plan.nextStep,contextNextStep(c));if(i===2)assert.equal(plan.nextStep?.kind,'PICKUP_ANSWER');if(i===1)assert.equal(plan.nextStep?.kind,'PICKUP_WAIT');const text=JSON.stringify(plan);for(const secret of ['budgetMinor','optionalText','_preference','_catalog','nomineeMemberId','preferenceId'])assert.ok(!text.includes(secret));}
});
test('invite preview reveals only approved public identity for a valid open invitation',async()=>{
 const x=await group(6);assert.deepEqual(await intake.invitationPreview(x.g.invite),{organizerName:'Alex',studioName:catalog.studioName});
 await assert.rejects(intake.invitationPreview('f'.repeat(64)),/NOT_FOUND/);await assert.rejects(intake.invitationPreview('example'));
 const c=await intake.participantContext(x.actors[0],x.g.groupId);await intake.closeRoster(x.actors[0],{commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:c.revision,memberIds:x.ids});await assert.rejects(intake.invitationPreview(x.g.invite),/NOT_FOUND/);
});

test('studio waiting context identifies only the requested public session and clears after a private edit',async()=>{
 const x=await group(6),merchant=actor(),bookings=new BookingService(pool);
 await pool.query('INSERT INTO merchant_studios VALUES($1,$2,$3,$4,15,20)',[catalog.studioId,merchant.userId,'synthetic_merchant',randomUUID()]);
 await pool.query('INSERT INTO merchant_catalog_versions VALUES($1,$2,$3)',[catalog.studioId,catalog.versionId,JSON.stringify(catalog)]);
 let c=await intake.participantContext(x.actors[0],x.g.groupId);
 const closed=await intake.closeRoster(x.actors[0],{commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:c.revision,memberIds:x.ids});
 const request=await bookings.request(x.actors[0],{commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:closed.revision,offeringId:'handbuild',slotId:'thu-evening'});
 c=await intake.participantContext(x.actors[0],x.g.groupId);const list=(await intake.plans(x.actors[1])).plans[0];
 assert.deepEqual(c.requestedSession,{activity:catalog.offerings.find((o:any)=>o.id==='handbuild').name,startAt:catalog.slots.find((s:any)=>s.id==='thu-evening').startAt,timezone:catalog.timezone,amountMinor:4800});
 assert.equal(c.studioReviewNeedsRefresh,false);assert.equal(list.startAt,c.requestedSession!.startAt);assert.equal(list.studioReviewNeedsRefresh,false);assert.equal(list.nextStep?.kind,'STUDIO_WAIT');
 await intake.save(x.actors[0],{commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:request.revision,expectedPreferenceId:c.preference!.revisionId,preference:{...preference,budgetMinor:6000},optionalText:null});
 c=await intake.participantContext(x.actors[0],x.g.groupId);assert.equal(c.requestedSession,null);assert.equal(c.studioReviewNeedsRefresh,true);assert.equal((await intake.plans(x.actors[1])).plans[0].startAt,null);
});
