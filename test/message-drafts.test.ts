import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {database,localDatabaseUrl} from '../src/db.ts';
import {migrationVersions} from '../src/migrations.ts';
import {IntakeService,type IntakeActor} from '../src/intake/service.ts';
import {MessageDraftService} from '../src/intake/message-drafts.ts';
import {ClarificationService} from '../src/intake/clarifications.ts';
import {purgeExpiredPrivateText} from '../src/intake/retention.ts';
import {draftFields,reviewDraftProposal} from '../src/planning/draft.ts';
import {clarify,type Clarification} from '../src/ai/clarifier.ts';
const base=process.env.TEST_DATABASE_URL??localDatabaseUrl,schema=`messages_${randomUUID().replaceAll('-','')}`,admin=database(base),u=new URL(base);u.searchParams.set('options',`-c search_path=${schema},public`);const pool=database(u.toString()),intake=new IntakeService(pool);
const catalog=JSON.parse(await readFile(new URL('../fixtures/studio.json',import.meta.url),'utf8'));
const pref={budgetMinor:5100,availableSlotIds:['thu-evening'],latestFinishAt:null,technique:'ANY',outcome:'FORM_OWN_CUP',collection:'NOMINEE_LATER',nomineeMemberId:null,extraRequirement:'NONE',unresolvedKeys:['COLLECTION']};
const text='I want to make my own cup. A friend needs to pick it up.';
const actor=():IntakeActor=>({userId:randomUUID(),emailVerified:true});
const proposal=(input:{revisionId:string;text:string}):Clarification=>({status:'PROPOSAL',proposal:{schemaVersion:1,preferenceRevisionId:input.revisionId,interpretations:[{requirementKey:'OUTCOME',proposedValue:'FORM_OWN_CUP',sourceStart:0,sourceEnd:25,sourceSpan:input.text.slice(0,25),certainty:'explicit'},{requirementKey:'COLLECTION',proposedValue:'NOMINEE_LATER',sourceStart:26,sourceEnd:input.text.length,sourceSpan:input.text.slice(26),certainty:'explicit'}],question:null}});
before(async()=>{await admin.query(`CREATE SCHEMA ${schema}`);for(const m of migrationVersions)await pool.query(await readFile(new URL(`../db/${m}.sql`,import.meta.url),'utf8'));});
after(async()=>{await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();});
async function setup(a=actor()){const g=await intake.create(a,{commandId:randomUUID(),displayName:'Alex',catalog}),b=actor();await intake.join(b,{commandId:randomUUID(),invite:g.invite,displayName:'Friend'});return {a,b,g,start:{commandId:randomUUID(),groupId:g.groupId,sourcePreferenceId:null,text,modelProcessingAgreed:true as const}};}
const save=(x:Awaited<ReturnType<typeof setup>>,draftId:string,extra={})=>({commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:1,expectedPreferenceId:null,preference:pref,optionalText:text,messageDraft:{id:draftId,answerId:null,confirmsAllEssentials:true},...extra});
test('clear message drafts two grounded choices once without changing readiness, requirements, dates or budget',async()=>{
 const x=await setup();let calls=0;const service=new MessageDraftService(pool,async input=>{calls++;assert.deepEqual(Object.keys(input).sort(),['catalog','revisionId','text']);assert.equal(JSON.stringify(input).includes('budgetMinor'),false);return proposal(input);});
 const [a,b]=await Promise.all([service.start(x.a,x.start),service.start(x.a,x.start)]);const view=await service.view(x.a,x.g.groupId);assert.equal(view?.status,'READY');assert.equal(calls,1);assert.equal(a?.id,b?.id);assert.deepEqual(draftFields(view!.proposal!,null),{outcome:'FORM_OWN_CUP',collection:'NOMINEE_LATER'});
 const before=await intake.participantContext(x.a,x.g.groupId);assert.equal(before.preference,null);assert.equal(before.members.find(m=>m.id===x.g.memberId)?.ready,false);assert.equal(before.revision,1);
 const command=save(x,view!.id),saved=await intake.save(x.a,command);assert.deepEqual(await intake.save(x.a,command),saved);
 const after=await intake.participantContext(x.a,x.g.groupId);assert.equal(after.preference!.budgetMinor,5100);assert.deepEqual(after.preference!.availableSlotIds,['thu-evening']);assert.equal(after.preference!.nomineeMemberId,null);assert.equal(after.preference!.extraRequirement,'NONE');assert.equal(after.wordingReviewed,true);assert.deepEqual(after.collectionRequests,[]);
 const peer=JSON.stringify(await intake.participantContext(x.b,x.g.groupId));for(const secret of [text,'sourceSpan','5100','intake_message_drafts'])assert.ok(!peer.includes(secret));
});
test('drafts require verified ownership, scoped group, explicit processing consent and the current preference',async()=>{
 const x=await setup();let calls=0;const service=new MessageDraftService(pool,async i=>{calls++;return proposal(i);});
 await assert.rejects(service.start(x.a,{...x.start,modelProcessingAgreed:false}));await assert.rejects(service.start({...x.a,emailVerified:false},x.start),/VERIFIED_IDENTITY_REQUIRED/);await assert.rejects(service.start(actor(),x.start),/NOT_FOUND/);assert.equal(calls,0);
 const view=await service.start(x.a,x.start);assert.equal(await service.view(x.b,x.g.groupId),null);await assert.rejects(intake.save(x.b,save(x,view!.id)),/NOT_FOUND/);
 await intake.save(x.a,{...save(x,view!.id),messageDraft:undefined});await assert.rejects(service.start(x.a,{...x.start,commandId:randomUUID(),text:text+' '}),/STALE_PREFERENCE/);
});
test('field edits, note edits, missing confirmation and invented fields cannot silently approve an AI draft',async()=>{
 const x=await setup(),service=new MessageDraftService(pool,async i=>proposal(i)),view=await service.start(x.a,x.start);
 await assert.rejects(intake.save(x.a,save(x,view!.id,{preference:{...pref,outcome:'DECORATE_EXISTING'}})),/DRAFT_CHOICES_CHANGED/);
 await assert.rejects(intake.save(x.a,save(x,view!.id,{optionalText:'A different message'})),/STALE_DRAFT/);
 await assert.rejects(intake.save(x.a,save(x,view!.id,{messageDraft:{id:view!.id,answerId:null,confirmsAllEssentials:false}})));
 await assert.rejects(intake.save(x.a,save(x,view!.id,{messageDraft:{id:view!.id,answerId:null,confirmsAllEssentials:true,budgetMinor:1}})));
 assert.equal((await intake.participantContext(x.a,x.g.groupId)).preference,null);
});
test('ambiguity asks one bounded question and its answer drafts pickup without selecting dates or a volunteer',async()=>{
 const x=await setup(),ambiguous='I leave Friday.';const service=new MessageDraftService(pool,async i=>({status:'PROPOSAL',proposal:{schemaVersion:1,preferenceRevisionId:i.revisionId,interpretations:[{requirementKey:'TRAVEL',proposedValue:'COLLECTION_ONLY',sourceStart:0,sourceEnd:i.text.length,sourceSpan:i.text,certainty:'ambiguous'}],question:{templateId:'TRAVEL_MEANING',requirementKey:'TRAVEL',relevantOfferingIds:['handbuild'],options:[{id:'attend',value:'CANNOT_ATTEND'},{id:'pickup',value:'COLLECTION_ONLY'}]}}}));
 const view=await service.start(x.a,{...x.start,text:ambiguous});assert.equal(view?.status,'READY');assert.throws(()=>draftFields(view!.proposal!,null),/INVALID_ANSWER/);assert.deepEqual(draftFields(view!.proposal!,'pickup'),{collection:'NOMINEE_LATER'});
 const cmd={...save(x,view!.id,{optionalText:ambiguous}),messageDraft:{id:view!.id,answerId:'attend',confirmsAllEssentials:true}};await assert.rejects(intake.save(x.a,cmd),/DRAFT_CHOICES_CHANGED/);
 await intake.save(x.a,{...cmd,commandId:randomUUID(),messageDraft:{...cmd.messageDraft,answerId:'pickup'}});assert.equal((await intake.participantContext(x.a,x.g.groupId)).preference!.nomineeMemberId,null);
});
test('unsupported needs and contradictory supported choices fail closed; manual fallback keeps the note unresolved',async()=>{
 for(const mode of ['EXTRA','CONTRADICTION','BAD_QUOTE']){const x=await setup(),service=new MessageDraftService(pool,async i=>{const r=proposal(i);if(r.status!=='PROPOSAL')return r;
  if(mode==='EXTRA')r.proposal.interpretations.push({requirementKey:'EXTRA',proposedValue:'MERCHANT_REVIEW_REQUIRED',sourceStart:0,sourceEnd:i.text.length,sourceSpan:i.text,certainty:'explicit'});
  if(mode==='CONTRADICTION')r.proposal.interpretations.push({...r.proposal.interpretations[1],proposedValue:'SELF_LATER'});
  if(mode==='BAD_QUOTE')r.proposal.interpretations[0].sourceSpan='Invented';return r;});
  const view=await service.start(x.a,x.start);assert.equal(view?.status,'REVIEW');assert.equal(view.proposal,null);
  await intake.save(x.a,{...save(x,view.id),messageDraft:undefined});assert.equal((await intake.participantContext(x.a,x.g.groupId)).preference!.extraRequirement,'MERCHANT_REVIEW_REQUIRED');
 }
});
test('late results cannot replace another tab’s saved preference; unrelated friend updates do not invalidate the draft',async()=>{
 for(const ownEdit of [true,false]){const x=await setup();let finish!:(v:Clarification)=>void,arrived!:(v:unknown)=>void;const began=new Promise(r=>arrived=r);let input:any;
 const service=new MessageDraftService(pool,async i=>{input=i;arrived(null);return new Promise(r=>finish=r);}),request=service.start(x.a,x.start);await began;
 const person=ownEdit?x.a:x.b;await intake.save(person,{...save(x,randomUUID()),preference:{...pref,collection:'SELF_LATER',unresolvedKeys:[]},optionalText:null,messageDraft:undefined});finish(proposal(input));await request;
 const row=(await pool.query('SELECT status,result FROM intake_message_drafts WHERE id=$1',[input.revisionId])).rows[0];assert.equal(row.status,ownEdit?'STALE':'READY');if(ownEdit)assert.equal(row.result,null);
 }
});
test('expiry redacts raw messages through the existing maintenance entry point without resetting daily usage',async()=>{
 const x=await setup(),service=new MessageDraftService(pool,async i=>proposal(i)),view=await service.start(x.a,x.start);
 await assert.rejects(pool.query("UPDATE intake_message_drafts SET expires_at=expires_at+interval '1 minute' WHERE id=$1",[view!.id]));
 await pool.query('ALTER TABLE intake_message_drafts DISABLE TRIGGER message_draft_clock');await pool.query("UPDATE intake_message_drafts SET created_at=statement_timestamp()-interval '40 minutes',expires_at=statement_timestamp()-interval '10 minutes' WHERE id=$1",[view!.id]);await pool.query('ALTER TABLE intake_message_drafts ENABLE TRIGGER message_draft_clock');
 await assert.rejects(intake.save(x.a,save(x,view!.id)),/STALE_DRAFT/);assert.equal(await purgeExpiredPrivateText(pool),1);
 const row=(await pool.query('SELECT text_value,result,status FROM intake_message_drafts WHERE id=$1',[view!.id])).rows[0];assert.deepEqual(row,{text_value:null,result:null,status:'STALE'});assert.equal(await service.view(x.a,x.g.groupId),null);
 await assert.rejects(pool.query('UPDATE intake_message_drafts SET text_value=$2 WHERE id=$1',[view!.id,text]));assert.equal((await pool.query('SELECT ai_calls FROM planning_members WHERE id=$1',[x.g.memberId])).rows[0].ai_calls,1);
});
test('manual changes require a separate explicit complete-message declaration to avoid an unresolved note',async()=>{
 const x=await setup();await intake.save(x.a,{...save(x,randomUUID()),messageDraft:undefined,declaresNoAdditionalMustHaves:true,preference:{...pref,collection:'SELF_LATER',unresolvedKeys:[]}});const c=await intake.participantContext(x.a,x.g.groupId);assert.equal(c.wordingReviewed,true);assert.equal(c.preference!.collection,'SELF_LATER');assert.equal(c.preference!.extraRequirement,'NONE');
});
test('old clarifications and first-message drafts share the six-per-day actor allowance',async()=>{
 const a=actor();for(let n=0;n<6;n++){const x=await setup(a);if(n%2===0)await new MessageDraftService(pool,async i=>proposal(i)).start(a,x.start);else{
 const saved=await intake.save(a,{...save(x,randomUUID()),messageDraft:undefined});await new ClarificationService(pool,async i=>proposal(i)).start(a,{commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:saved.revision,preferenceId:saved.preferenceId,modelProcessingAgreed:true});}}
 const next=await setup(a);await assert.rejects(new MessageDraftService(pool,async i=>proposal(i)).start(a,next.start),/CLARIFICATION_LIMIT/);
 const saved=await intake.save(a,{...save(next,randomUUID()),messageDraft:undefined});await assert.rejects(new ClarificationService(pool,async i=>proposal(i)).start(a,{commandId:randomUUID(),groupId:next.g.groupId,expectedRevision:saved.revision,preferenceId:saved.preferenceId,modelProcessingAgreed:true}),/CLARIFICATION_LIMIT/);
});
test('draft-mode gateway sends only the consented message and public facts and rejects invented output keys',async()=>{
 const input={revisionId:randomUUID(),text,catalog};let calls=0;
 const transport:typeof fetch=async(_url,init)=>{calls++;const b=JSON.parse(String(init!.body)),data=JSON.parse(b.messages[1].content);assert.ok(!b.messages[0].content.includes(text));assert.deepEqual(Object.keys(data).sort(),['offerings','optionalParticipantWording','preferenceRevisionId']);assert.equal(data.members,undefined);assert.equal(data.budgetMinor,undefined);assert.equal(data.slots,undefined);const r=proposal(input);return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(r.status==='PROPOSAL'?r.proposal:null)}}]});};
 assert.equal((await clarify(input,{url:'https://gateway.example',key:'test-only',model:'test'},transport,undefined,true)).status,'PROPOSAL');assert.equal(calls,1);
 const result=proposal(input);if(result.status!=='PROPOSAL')throw Error('FIXTURE');const bad={...result.proposal,budgetMinor:100};const fake:typeof fetch=async()=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(bad)}}]});assert.equal((await clarify(input,{url:'https://gateway.example',key:'test-only',model:'test'},fake,undefined,true)).status,'NEEDS_REVIEW');
});
