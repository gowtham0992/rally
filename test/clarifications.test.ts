import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {database,localDatabaseUrl} from '../src/db.ts';
import {IntakeService,type IntakeActor} from '../src/intake/service.ts';
import {ClarificationService} from '../src/intake/clarifications.ts';
import type {Clarification} from '../src/ai/clarifier.ts';
import {budgetedClarifier} from '../src/ai/request-budget.ts';
import {subjectDigest} from '../src/web/rate-limits.ts';
const schema=`clarification_test_${randomUUID().replaceAll('-','')}`,admin=database(process.env.TEST_DATABASE_URL??localDatabaseUrl);
const url=new URL(process.env.TEST_DATABASE_URL??localDatabaseUrl);url.searchParams.set('options',`-c search_path=${schema},public`);
const pool=database(url.toString()),intake=new IntakeService(pool);
const catalog=JSON.parse(await readFile(new URL('../fixtures/studio.json',import.meta.url),'utf8'));for(const o of catalog.offerings)o.minPeople=2;
before(async()=>{await admin.query(`CREATE SCHEMA ${schema}`);for(const version of ['004_private_intake','005_collection_consent','007_clarifications','009_request_limits'])await pool.query(await readFile(new URL('../db/'+version+'.sql',import.meta.url),'utf8'));});
after(async()=>{await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();});
const actor=():IntakeActor=>({userId:randomUUID(),emailVerified:true});
const pref={budgetMinor:5000,availableSlotIds:['thu-evening'],latestFinishAt:null,technique:'ANY',outcome:'FORM_OWN_CUP',collection:'SELF_LATER',nomineeMemberId:null,extraRequirement:'NONE',unresolvedKeys:[]};
const proposal=(input:{revisionId:string;text:string}):Clarification=>({status:'PROPOSAL',proposal:{schemaVersion:1,preferenceRevisionId:input.revisionId,interpretations:[{requirementKey:'TRAVEL',proposedValue:'COLLECTION_ONLY',sourceStart:0,sourceEnd:input.text.length,sourceSpan:input.text,certainty:'ambiguous'}],question:{templateId:'TRAVEL_MEANING',requirementKey:'TRAVEL',relevantOfferingIds:['handbuild'],options:[{id:'attendance',value:'CANNOT_ATTEND'},{id:'collection',value:'COLLECTION_ONLY'}]}}});
async function setup(budget=5000){const a=actor(),b=actor(),g=await intake.create(a,{commandId:randomUUID(),targetSize:2,displayName:'Organizer',catalog}),join=await intake.join(b,{commandId:randomUUID(),invite:g.invite,displayName:'Friend'});
 const first=await intake.save(a,{commandId:randomUUID(),groupId:g.groupId,expectedRevision:join.revision,expectedPreferenceId:null,preference:{...pref,budgetMinor:budget},optionalText:'I leave Friday.'});
 const second=await intake.save(b,{commandId:randomUUID(),groupId:g.groupId,expectedRevision:first.revision,expectedPreferenceId:null,preference:pref,optionalText:null});
 return {a,b,g,join,first,second,start:{commandId:randomUUID(),groupId:g.groupId,expectedRevision:second.revision,preferenceId:first.preferenceId,modelProcessingAgreed:true as const}};
}
test('duplicate clarification requests dispatch once; answer is owner-confirmed and collection still requires two-party consent',async()=>{
 const x=await setup();let calls=0;const service=new ClarificationService(pool,async input=>{calls++;assert.deepEqual(Object.keys(input).sort(),['catalog','revisionId','text']);assert.equal(JSON.stringify(input).includes('budgetMinor'),false);return proposal(input);});
 await Promise.all([service.start(x.a,x.start),service.start(x.a,x.start)]);assert.equal(calls,1);
 const view=await new ClarificationService(pool).view(x.a,x.g.groupId);assert.equal(view?.status,'READY');assert.equal((await intake.ownPreferences(x.a,x.g.groupId)).preference.collection,'SELF_LATER');
 const command={commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:x.second.revision,preferenceId:x.first.preferenceId,clarificationId:view!.id,answerId:'collection',confirmsAllEssentials:true};
 const answered=await service.answer(x.a,command);assert.deepEqual(await new ClarificationService(pool).answer(x.a,command),answered);
 const own=await intake.ownPreferences(x.a,x.g.groupId);assert.equal(own.preference.budgetMinor,5000);assert.equal(own.preference.collection,'NOMINEE_LATER');assert.equal(own.preference.nomineeMemberId,null);assert.equal(own.preference.extraRequirement,'NONE');
 const saved=await intake.save(x.a,{commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:answered.revision,expectedPreferenceId:answered.preferenceId,preference:{...pref,collection:'NOMINEE_LATER',nomineeMemberId:x.join.memberId},optionalText:'I leave Friday.'});
 assert.equal((await intake.ownPreferences(x.a,x.g.groupId)).preference.extraRequirement,'NONE');
 const closed=await intake.closeRoster(x.a,{commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:saved.revision,memberIds:[x.g.memberId,x.join.memberId]});
 assert.equal((await intake.plan(x.a,x.g.groupId)).result.state,'NEEDS_CLARIFICATION');
 const owner=await intake.collectionConsent(x.a,{commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:closed.revision,preferenceId:saved.preferenceId,action:'OWNER_AGREE',disclosureAgreed:true});
 await intake.collectionConsent(x.b,{commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:owner.revision,preferenceId:saved.preferenceId,action:'NOMINEE_AGREE',disclosureAgreed:true});
 assert.equal((await intake.plan(x.a,x.g.groupId)).result.state,'CANDIDATE_READY');
});
test('other members cannot read a private proposal or answer it; consent and source revisions cannot be forged',async()=>{
 const x=await setup(),service=new ClarificationService(pool,async input=>proposal(input));
 await assert.rejects(service.start(x.a,{...x.start,modelProcessingAgreed:false}));const view=await service.start(x.a,x.start);assert.equal(await service.view(x.b,x.g.groupId),null);
 await assert.rejects(service.view(actor(),x.g.groupId),/NOT_FOUND/);
 await assert.rejects(service.answer(x.b,{commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:x.second.revision,preferenceId:x.second.preferenceId,clarificationId:view!.id,answerId:'collection',confirmsAllEssentials:true}),/NOT_FOUND/);
 await assert.rejects(service.answer(x.a,{commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:x.second.revision,preferenceId:x.first.preferenceId,clarificationId:view!.id,answerId:'invented',confirmsAllEssentials:true}),/INVALID_ANSWER/);
 const context=await intake.participantContext(x.b,x.g.groupId);assert.equal(JSON.stringify(context).includes('I leave Friday.'),false);
 const roster=await intake.roster(x.a,x.g.groupId);assert.equal(JSON.stringify(roster).includes('COLLECTION_ONLY'),false);
});
test('model work holds no database lock; preference changes discard the late result',async()=>{
 const x=await setup();let release!:(v:Clarification)=>void,notify!:()=>void,input!:Parameters<typeof proposal>[0];const started=new Promise<void>(r=>notify=r);
 const service=new ClarificationService(pool,async i=>{input=i;notify();return new Promise<Clarification>(r=>release=r);});const pending=service.start(x.a,x.start);await started;
 await intake.save(x.a,{commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:x.second.revision,expectedPreferenceId:x.first.preferenceId,preference:pref,optionalText:'I leave Saturday.'});release(proposal(input));await pending;
 const row=(await pool.query('SELECT status,result FROM planning_clarifications WHERE member_id=$1',[x.g.memberId])).rows[0];assert.equal(row.status,'STALE');assert.equal(row.result,null);
 assert.equal((await intake.ownPreferences(x.a,x.g.groupId)).optionalText,'I leave Saturday.');
});
test('two-question limit persists across revisions, declines and service restarts',async()=>{
 const x=await setup(),service=new ClarificationService(pool,async input=>proposal(input));let start=x.start;
 for(let n=0;n<2;n++){
  const view=await service.start(x.a,start);assert.equal(view?.status,'READY');
  await service.decline(x.a,{commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:start.expectedRevision,preferenceId:start.preferenceId,clarificationId:view!.id});
  const saved=await intake.save(x.a,{commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:start.expectedRevision,expectedPreferenceId:start.preferenceId,preference:pref,optionalText:'I leave Friday. '+n});
  start={...start,commandId:randomUUID(),expectedRevision:saved.revision,preferenceId:saved.preferenceId};
 }
 await assert.rejects(new ClarificationService(pool,async input=>proposal(input)).start(x.a,start),/CLARIFICATION_LIMIT/);
 const member=(await pool.query('SELECT ai_questions,ai_calls FROM planning_members WHERE id=$1',[x.g.memberId])).rows[0];assert.equal(member.ai_questions,2);assert.equal(member.ai_calls,2);
});
test('irrelevant questions and unsupported evidence fail closed; structured note confirmation is explicit and private',async()=>{
 const x=await setup(3000),service=new ClarificationService(pool,async input=>proposal(input));assert.equal((await service.start(x.a,x.start))?.status,'REVIEW');
 assert.equal((await pool.query('SELECT ai_questions FROM planning_members WHERE id=$1',[x.g.memberId])).rows[0].ai_questions,0);
 assert.equal((await intake.ownPreferences(x.a,x.g.groupId)).preference.extraRequirement,'MERCHANT_REVIEW_REQUIRED');
 const p={commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:x.second.revision,preferenceId:x.first.preferenceId,declaresNoAdditionalMustHaves:true};
 await assert.rejects(service.confirmStructuredNote(x.a,{...p,declaresNoAdditionalMustHaves:false}));
 const confirmed=await service.confirmStructuredNote(x.a,p);assert.equal((await intake.ownPreferences(x.a,x.g.groupId)).preference.budgetMinor,3000);
 assert.equal((await intake.participantContext(x.a,x.g.groupId)).wordingReviewed,true);
 await intake.save(x.a,{commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:confirmed.revision,expectedPreferenceId:confirmed.preferenceId,preference:{...pref,budgetMinor:3000,technique:'WHEEL'},optionalText:'I leave Friday.'});
 assert.equal((await intake.ownPreferences(x.a,x.g.groupId)).preference.extraRequirement,'MERCHANT_REVIEW_REQUIRED');
});
test('interrupted reservations and dispatches expire to review without another model call',async()=>{
 for(const status of ['RESERVED','DISPATCHED']){
  const x=await setup(),id=randomUUID();let calls=0;
  await pool.query("INSERT INTO planning_clarifications(id,member_id,source_preference_id,source_group_revision,status,created_at,started_at) VALUES($1,$2,$3,$4,$5,clock_timestamp()-interval '60 seconds',CASE WHEN $5='DISPATCHED' THEN clock_timestamp()-interval '60 seconds' ELSE NULL END)",[id,x.g.memberId,x.first.preferenceId,x.second.revision,status]);
  const service=new ClarificationService(pool,async input=>{calls++;return proposal(input);});
  assert.equal((await service.view(x.a,x.g.groupId))?.status,'REVIEW');assert.equal((await service.start(x.a,x.start))?.status,'REVIEW');assert.equal(calls,0);
  assert.equal((await intake.ownPreferences(x.a,x.g.groupId)).preference.extraRequirement,'MERCHANT_REVIEW_REQUIRED');
 }
});

test('global model budget is reserved after ownership and once per dispatch; exhaustion leaves saved choices unchanged',async()=>{
 const x=await setup(),key='c'.repeat(64),digest=subjectDigest(key,'MODEL_GLOBAL','application');let calls=0;
 const service=new ClarificationService(pool,budgetedClarifier(pool,async input=>{calls++;return proposal(input);},()=>key));
 await assert.rejects(service.start(actor(),x.start),/NOT_FOUND/);
 assert.equal((await pool.query('SELECT count(*) FROM request_limits WHERE scope=$1',['MODEL_GLOBAL'])).rows[0].count,'0');
 await Promise.all([service.start(x.a,x.start),service.start(x.a,x.start)]);assert.equal(calls,1);
 assert.equal((await pool.query('SELECT hits FROM request_limits WHERE scope=$1 AND subject_digest=$2',['MODEL_GLOBAL',digest])).rows[0].hits,1);
 await pool.query('UPDATE request_limits SET hits=72 WHERE scope=$1 AND subject_digest=$2',['MODEL_GLOBAL',digest]);
 const y=await setup(),before=await intake.ownPreferences(y.a,y.g.groupId);
 assert.equal((await service.start(y.a,y.start))?.status,'REVIEW');assert.equal(calls,1);
 assert.deepEqual(await intake.ownPreferences(y.a,y.g.groupId),before);
 assert.equal((await service.start(y.a,y.start))?.status,'REVIEW');assert.equal(calls,1);
 assert.equal((await pool.query('SELECT hits FROM request_limits WHERE scope=$1 AND subject_digest=$2',['MODEL_GLOBAL',digest])).rows[0].hits,72);
});

test('another friend saving during model work preserves the owners valid clarification and answer',async()=>{
 const x=await setup();let release!:(v:Clarification)=>void,notify!:()=>void,input!:Parameters<typeof proposal>[0];const started=new Promise<void>(r=>notify=r);
 const service=new ClarificationService(pool,async i=>{input=i;notify();return new Promise<Clarification>(r=>release=r);});const pending=service.start(x.a,x.start);await started;
 await intake.save(x.b,{commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:x.second.revision,expectedPreferenceId:x.second.preferenceId,preference:{...pref,budgetMinor:5200},optionalText:null});
 release(proposal(input));const view=await pending;assert.equal(view?.status,'READY');
 await service.answer(x.a,{commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:x.second.revision,preferenceId:x.first.preferenceId,clarificationId:view!.id,answerId:'collection',confirmsAllEssentials:true});
 assert.equal((await intake.ownPreferences(x.a,x.g.groupId)).preference.collection,'NOMINEE_LATER');
});
