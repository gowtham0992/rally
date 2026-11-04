import {randomUUID} from 'node:crypto';
import type pg from 'pg';
import {z} from 'zod';
import {transaction} from '../db.ts';
import {assertWorkspaceScope} from '../demo/scope.ts';
import {catalogSchema,matchingSessions,preferenceSchema} from '../planning/domain.ts';
import {fingerprint} from '../payments/types.ts';
import {IntakeService,IntakeError,type IntakeActor} from './service.ts';
import {studioQuestionExpiries} from './studio-question-state.ts';
import {dailyAiCalls} from './ai-allowance.ts';
import {draftStudioQuestion,validateQuestionEvidence,questionFromEvidence,type QuestionInput,type QuestionDraft} from '../ai/studio-question.ts';
const uuid=z.uuid(),key=z.string().min(1).max(100),command=z.strictObject({commandId:uuid,groupId:uuid,sourcePreferenceId:uuid});
const askSchema=command.extend({offeringId:key,slotId:key,question:z.string().trim().min(5).max(600),disclosureAgreed:z.literal(true)});
// Historical discussion replies remain readable, but new replies must give a
// usable yes/no decision until an in-app follow-up channel exists.
const answerSchema=z.strictObject({commandId:uuid,questionId:uuid,decision:z.enum(['CAN_ACCOMMODATE','CANNOT_ACCOMMODATE']),reply:z.string().trim().min(1).max(1000),sessionConfirmed:z.literal(true)});
const acceptSchema=command.extend({questionId:uuid,confirmsAllEssentials:z.literal(true),replyReviewed:z.literal(true)});
const draftSchema=command.extend({offeringId:key,slotId:key,modelProcessingAgreed:z.literal(true)});
export type StudioQuestion={id:string;question:string;decision:'CAN_ACCOMMODATE'|'CANNOT_ACCOMMODATE'|'NEEDS_DISCUSSION'|null;reply:string|null;accepted:boolean;activity:string;startAt:string;timezone:string;offeringId:string;slotId:string};
function ordinaryModalUse(text:string,start:number,end:number,word:string){
 if(!['will','may','can'].includes(word))return false;
 // Recognize common auxiliary grammar with bounded subjects and bare verbs.
 // Every other
 // roster-name token is still checked separately, including names in subjects.
 const token="[\\p{L}]+(?:[-’'][\\p{L}]+)*",pronoun='(?:i|we|you|they|he|she|it|there|this|that|these|those|someone|anyone|somebody|anybody|everyone|everybody)';
 const determiner='(?:the|a|an|my|our|your|their|his|her|this|that|these|those|any|some|each|every)';
 const nounPhrase=determiner+'\\s+'+token+'(?:\\s+'+token+'){0,6}';
 const barePhrase='(?:seating|access|equipment|assistance|lighting|ventilation|gloves|clay|materials|space|step-free access)(?:\\s+'+token+'){0,5}';
 const subject='(?:'+pronoun+'|'+nounPhrase+'|'+barePhrase+')';
 const verb='(?:be|have|need|use|include|provide|allow|offer|work|bring|wear|sit|stand|arrive|leave|contain|help|get|ask|accommodate|make|fit|keep|confirm|check|explain|access|collect|pick|attend|assist|seat|come|join|enter|participate|accompany|stay|wait|reach|move|turn|transfer|handle|hold|avoid|choose|support|change|open|close|see|hear|request|receive|require|cost|take|give|remove|supply|accept|carry|walk|communicate|reserve|wash|clean|fire|glaze|paint|touch|try|learn|do)\\b';
 const predicate='(?:only\\s+|not\\s+|also\\s+|still\\s+|please\\s+|safely\\s+|possibly\\s+|just\\s+)*'+verb;
 const before=text.slice(0,start),after=text.slice(end),boundary='(?:^|[.!?;,:]\\s*|\\b(?:if|whether|that|because|and|but)\\s+)';
 if(/(?:^|[.!?;]\s*)[“"‘'(]*\s*$/u.test(before)&&new RegExp('^\\s+'+subject+'\\s+'+predicate,'u').test(after))return true;
 if(new RegExp(boundary+subject+'\\s+$','u').test(before)&&new RegExp('^\\s+'+predicate,'u').test(after))return true;
 // A question tag is also an auxiliary, not a person being addressed.
 return /,\s*$/u.test(before)&&new RegExp('^\\s+'+pronoun+'\\s*\\?','u').test(after);
}
async function retireInterruptedDrafts(c:pg.PoolClient,memberId:string){
 // The same retirement rule applies to a replay and a fresh command after a
 // reload. Terminal status also fences out a late model result.
 await c.query("UPDATE studio_question_drafts SET status='REVIEW',result=$2 WHERE member_id=$1 AND status IN ('RESERVED','DISPATCHED') AND created_at<clock_timestamp()-interval '45 seconds' AND expires_at>clock_timestamp()",[memberId,JSON.stringify({reviewReason:'UNAVAILABLE'})]);
}
// Check identity references, not a blanket whitelist of names that are also
// English modals. Ambiguous uses and obvious contact/financial text fail closed.
export function checkQuestionPrivacy(text:string,names:string[]){
 const normalized=text.normalize('NFKC').toLocaleLowerCase();
 if(/[@$€£¥]|https?:|www\.|\b(?:usd|dollars?|budget|spending limit)\b|\d[\d\s().+-]{5,}\d|[\u0000-\u001f\u007f]/iu.test(normalized))throw new IntakeError('QUESTION_PRIVACY');
 const words=new Set(names.flatMap(name=>name.normalize('NFKC').toLocaleLowerCase().split(/[^\p{L}\p{N}]+/u).filter(s=>s.length>=2)));
 for(const match of normalized.matchAll(/[\p{L}\p{N}]+/gu))if(words.has(match[0])&&!ordinaryModalUse(normalized,match.index!,match.index!+match[0].length,match[0])){
  const error=new IntakeError('QUESTION_PRIVACY');
  if(['will','may','can'].includes(match[0]))Object.assign(error,{matchedWord:match[0]});
  throw error;
 }
}
export class StudioQuestionService{
 private intake:IntakeService;
 constructor(private pool:pg.Pool,private model:(input:QuestionInput)=>Promise<QuestionDraft>=draftStudioQuestion,private aiDraftEnabled=false,private relayEnabled=true){this.intake=new IntakeService(pool);}
 private actor(a:IntakeActor){uuid.parse(a.userId);if(a.demoWorkspaceId)uuid.parse(a.demoWorkspaceId);if(a.emailVerified!==true)throw new IntakeError('VERIFIED_IDENTITY_REQUIRED');}
 private async group(c:pg.PoolClient,a:IntakeActor,id:string){this.actor(a);uuid.parse(id);const g=(await c.query('SELECT * FROM planning_groups WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!g)throw new IntakeError('NOT_FOUND');assertWorkspaceScope(a,g);return g;}
 private async owned(c:pg.PoolClient,a:IntakeActor,id:string){const group=await this.group(c,a,id),member=(await c.query(`SELECT m.*,p.confirmed,CASE WHEN p.private_text_expires_at<=clock_timestamp() THEN NULL ELSE p.optional_text END AS optional_text,p.private_text_expires_at FROM planning_members m LEFT JOIN preference_revisions p ON p.id=m.current_preference_id WHERE m.group_id=$1 AND m.user_id=$2`,[id,a.userId])).rows[0];
  if(!member||member.excluded||(group.state!=='COLLECTING'&&!member.admitted))throw new IntakeError('NOT_FOUND');return {group,member};}
 private editable(group:any){if(!['COLLECTING','CLOSED','MERCHANT_REVIEW'].includes(group.state))throw new IntakeError('PLANNING_LOCKED');}
 private session(g:any,offeringId:string,slotId:string){const catalog=catalogSchema.parse(g.catalog),offering=catalog.offerings.find(o=>o.id===offeringId&&o.verified&&o.slotIds.includes(slotId)),slot=catalog.slots.find(s=>s.id===slotId);if(!offering||!slot)throw new IntakeError('NO_VALID_CANDIDATE');return {catalog,offering,slot};}
 private projection(row:any,g:any):StudioQuestion{const {catalog,offering,slot}=this.session(g,row.offering_id,row.slot_id);return {id:row.id,question:row.question,decision:row.decision,reply:row.reply,accepted:Boolean(row.accepted_preference_id),activity:offering.name,startAt:slot.startAt,timezone:catalog.timezone,offeringId:offering.id,slotId:slot.id};}
 async own(a:IntakeActor,groupId:string){return transaction(this.pool,async c=>{const {group,member}=await this.owned(c,a,groupId);
  const q=(await c.query('SELECT * FROM studio_questions WHERE member_id=$1 AND (source_preference_id=$2 OR accepted_preference_id=$2) AND studio_id=$3 AND catalog_version_id=$4 AND expires_at>clock_timestamp() AND question IS NOT NULL ORDER BY created_at DESC,id DESC LIMIT 1',[member.id,member.current_preference_id,group.catalog.studioId,group.catalog.versionId])).rows[0];
  const expiry=(await studioQuestionExpiries(c,[member.id])).get(member.id)??null;
  const catalog=catalogSchema.parse(group.catalog),sessions=member.confirmed?matchingSessions(catalog,[preferenceSchema.parse(member.confirmed)],group.target_size).filter(s=>Date.parse(s.startAt)>Date.now()):[];
  const studio=(await c.query('SELECT 1 FROM merchant_catalog_versions WHERE studio_id=$1 AND version_id=$2 AND catalog=$3::jsonb',[catalog.studioId,catalog.versionId,JSON.stringify(catalog)])).rowCount;
  return {question:q?this.projection(q,group):null,expiry,available:Boolean(studio)&&this.relayEnabled&&!expiry,aiDraftAvailable:this.aiDraftEnabled&&this.relayEnabled&&!expiry,sessions:sessions.map(s=>({offeringId:s.offeringId,slotId:s.slotId,activity:s.activity,startAt:s.startAt,timezone:s.timezone}))};
 });}
 async ask(a:IntakeActor,value:unknown){const p=askSchema.parse(value);if(!this.relayEnabled)throw new IntakeError('QUESTION_UNAVAILABLE');return this.intake.recordCommand(a,p.commandId,{kind:'ASK_STUDIO_QUESTION',...p,question:fingerprint(p.question)},async c=>{
  const {group,member}=await this.owned(c,a,p.groupId);this.editable(group);if(member.current_preference_id!==p.sourcePreferenceId)throw new IntakeError('STALE_PREFERENCE');
  if(!member.optional_text?.trim()||member.private_text_expires_at&&new Date(member.private_text_expires_at).getTime()<=Date.now())throw new IntakeError('NO_NOTE');
  const pref=preferenceSchema.parse(member.confirmed);if(pref.extraRequirement!=='MERCHANT_REVIEW_REQUIRED')throw new IntakeError('NOTE_ALREADY_REVIEWED');
  const {catalog}=this.session(group,p.offeringId,p.slotId);
  if(!matchingSessions(catalog,[pref],group.target_size).some(s=>s.offeringId===p.offeringId&&s.slotId===p.slotId&&Date.parse(s.startAt)>Date.now()))throw new IntakeError('NO_VALID_CANDIDATE');
  if(!(await c.query('SELECT 1 FROM merchant_catalog_versions WHERE studio_id=$1 AND version_id=$2 AND catalog=$3::jsonb',[catalog.studioId,catalog.versionId,JSON.stringify(catalog)])).rowCount)throw new IntakeError('UNVERIFIED_CATALOG');
  checkQuestionPrivacy(p.question,(await c.query('SELECT display_name FROM planning_members WHERE group_id=$1',[group.id])).rows.map(r=>r.display_name));
  if((await c.query('SELECT 1 FROM studio_questions WHERE member_id=$1 AND source_preference_id=$2',[member.id,p.sourcePreferenceId])).rowCount)throw new IntakeError('QUESTION_PENDING');
  if(Number((await c.query('SELECT count(*) FROM studio_questions WHERE member_id=$1',[member.id])).rows[0].count)>=8)throw new IntakeError('QUESTION_LIMIT');
  const id=randomUUID();await c.query(`INSERT INTO studio_questions(id,group_id,member_id,source_preference_id,studio_id,catalog_version_id,offering_id,slot_id,question,disclosure_agreed,expires_at)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,true,least(clock_timestamp()+interval '30 days',coalesce($10::timestamptz,'infinity'::timestamptz)))`,[id,group.id,member.id,p.sourcePreferenceId,catalog.studioId,catalog.versionId,p.offeringId,p.slotId,p.question,member.private_text_expires_at]);return {id};
 });}
 async inbox(a:IntakeActor,cursor:string|null=null){this.actor(a);if(cursor)uuid.parse(cursor);return transaction(this.pool,async c=>{
  if(a.demoWorkspaceId&&!(await c.query("SELECT 1 FROM demo_identities WHERE workspace_id=$1 AND user_id=$2 AND role='STUDIO'",[a.demoWorkspaceId,a.userId])).rowCount)throw new IntakeError('NOT_FOUND');
  if(!(await c.query('SELECT 1 FROM merchant_studios s LEFT JOIN demo_workspaces w ON w.studio_id=s.studio_id WHERE s.owner_user_id=$1 AND w.id IS NOT DISTINCT FROM $2::uuid',[a.userId,a.demoWorkspaceId??null])).rowCount)throw new IntakeError('NOT_FOUND');
  const before=cursor?(await c.query(`SELECT q.created_at::text AS created_at,q.id FROM studio_questions q JOIN merchant_studios s ON s.studio_id=q.studio_id JOIN planning_groups g ON g.id=q.group_id
   WHERE q.id=$1 AND s.owner_user_id=$2 AND g.demo_workspace_id IS NOT DISTINCT FROM $3::uuid`,[cursor,a.userId,a.demoWorkspaceId??null])).rows[0]:null;
  if(cursor&&!before)throw new IntakeError('NOT_FOUND');
  const rows=(await c.query(`SELECT q.*,g.catalog FROM studio_questions q JOIN merchant_studios s ON s.studio_id=q.studio_id JOIN planning_groups g ON g.id=q.group_id JOIN planning_members m ON m.id=q.member_id
   WHERE s.owner_user_id=$1 AND g.demo_workspace_id IS NOT DISTINCT FROM $2::uuid AND q.expires_at>clock_timestamp() AND q.question IS NOT NULL
   AND m.current_preference_id=q.source_preference_id AND NOT m.excluded AND (g.state='COLLECTING' OR m.admitted)
   AND g.state IN ('COLLECTING','CLOSED','MERCHANT_REVIEW') AND q.studio_id=g.catalog->>'studioId' AND q.catalog_version_id=g.catalog->>'versionId'
   AND ($3::timestamptz IS NULL OR (q.created_at,q.id)<($3::timestamptz,$4::uuid))
   ORDER BY q.created_at DESC,q.id DESC LIMIT 21`,[a.userId,a.demoWorkspaceId??null,before?.created_at??null,before?.id??null])).rows;
  return {questions:rows.slice(0,20).map(q=>this.projection(q,{catalog:q.catalog})),nextCursor:rows.length>20?rows[19].id as string:null};
 });}
 async answer(a:IntakeActor,value:unknown){const p=answerSchema.parse(value);return this.intake.recordCommand(a,p.commandId,{kind:'ANSWER_STUDIO_QUESTION',...p,reply:fingerprint(p.reply)},async c=>{
  const row=(await c.query('SELECT q.* FROM studio_questions q JOIN merchant_studios s ON s.studio_id=q.studio_id WHERE q.id=$1 AND s.owner_user_id=$2',[p.questionId,a.userId])).rows[0];if(!row)throw new IntakeError('NOT_FOUND');
  const g=await this.group(c,a,row.group_id);this.editable(g);
  // Re-read after the group lock: another studio tab may have answered while
  // this command waited. Immutable answers are never last-writer-wins.
  Object.assign(row,(await c.query('SELECT * FROM studio_questions WHERE id=$1 FOR UPDATE',[row.id])).rows[0]);
  const current=(await c.query('SELECT current_preference_id,admitted,excluded FROM planning_members WHERE id=$1',[row.member_id])).rows[0];
  if(row.decision||!row.question||new Date(row.expires_at).getTime()<=Date.now()||current.excluded||g.state!=='COLLECTING'&&!current.admitted||current.current_preference_id!==row.source_preference_id||g.catalog.studioId!==row.studio_id||g.catalog.versionId!==row.catalog_version_id)throw new IntakeError('STALE_QUESTION');
  await c.query('UPDATE studio_questions SET decision=$2,reply=$3,answered_at=clock_timestamp() WHERE id=$1',[row.id,p.decision,p.reply]);return {id:row.id as string};
 });}
 async accept(a:IntakeActor,value:unknown){const p=acceptSchema.parse(value);return this.intake.recordCommand(a,p.commandId,{kind:'ACCEPT_STUDIO_ANSWER',...p},async c=>{
  const {group,member}=await this.owned(c,a,p.groupId);this.editable(group);
  const q=(await c.query('SELECT * FROM studio_questions WHERE id=$1 AND member_id=$2',[p.questionId,member.id])).rows[0];if(!q)throw new IntakeError('NOT_FOUND');
  if(member.current_preference_id!==p.sourcePreferenceId||q.source_preference_id!==p.sourcePreferenceId||q.accepted_preference_id||new Date(q.expires_at).getTime()<=Date.now()||!q.question||!q.reply||q.studio_id!==group.catalog.studioId||q.catalog_version_id!==group.catalog.versionId||!member.optional_text)throw new IntakeError('STALE_QUESTION');
  if(q.decision!=='CAN_ACCOMMODATE')throw new IntakeError('QUESTION_UNRESOLVED');
  const {catalog}=this.session(group,q.offering_id,q.slot_id),pref=preferenceSchema.parse(member.confirmed);
  if(!matchingSessions(catalog,[pref],group.target_size).some(s=>s.offeringId===q.offering_id&&s.slotId===q.slot_id&&Date.parse(s.startAt)>Date.now()))throw new IntakeError('NO_VALID_CANDIDATE');
  const id=randomUUID(),confirmed={...pref,revisionId:id,extraRequirement:'NONE'},bound={studioQuestion:{questionId:q.id,confirmedByMemberId:member.id,acceptedPreferenceId:id,studioId:catalog.studioId,catalogVersionId:catalog.versionId,offeringId:q.offering_id,slotId:q.slot_id,expiresAt:new Date(q.expires_at).toISOString()}};
  await c.query('INSERT INTO preference_revisions(id,member_id,confirmed,optional_text,wording_bound,private_text_expires_at) VALUES($1,$2,$3,$4,$5,$6)',[id,member.id,JSON.stringify(confirmed),member.optional_text,JSON.stringify(bound),member.private_text_expires_at]);
  await c.query('UPDATE planning_members SET current_preference_id=$1 WHERE id=$2',[id,member.id]);await c.query('UPDATE studio_questions SET accepted_preference_id=$2 WHERE id=$1',[q.id,id]);
  const revision=(await c.query("UPDATE planning_groups SET revision=revision+1,candidate=NULL,state=CASE WHEN state='MERCHANT_REVIEW' THEN 'CLOSED' ELSE state END WHERE id=$1 RETURNING revision",[group.id])).rows[0].revision;
  await c.query("INSERT INTO planning_events(group_id,revision,kind) VALUES($1,$2,'PRIVATE_DETAILS_CONFIRMED')",[group.id,revision]);return {preferenceId:id,revision:revision as number};
 });}
 async draft(a:IntakeActor,value:unknown){const p=draftSchema.parse(value);
  if(!this.relayEnabled)throw new IntakeError('QUESTION_UNAVAILABLE');
  if(!this.aiDraftEnabled)throw new IntakeError('QUESTION_AI_UNAVAILABLE');
  const reserved=await this.intake.recordCommand(a,p.commandId,{kind:'DRAFT_STUDIO_QUESTION',...p},async c=>{
   await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,71))',[a.userId]);
   const {group,member}=await this.owned(c,a,p.groupId);this.editable(group);
   if(member.current_preference_id!==p.sourcePreferenceId)throw new IntakeError('STALE_PREFERENCE');
   if(!member.optional_text?.trim())throw new IntakeError('NO_NOTE');if(member.optional_text.length>1500)throw new IntakeError('NOTE_TOO_LONG');
   if(member.private_text_expires_at&&new Date(member.private_text_expires_at).getTime()<=Date.now())throw new IntakeError('NO_NOTE');
   const {catalog}=this.session(group,p.offeringId,p.slotId),pref=preferenceSchema.parse(member.confirmed);
   if(pref.extraRequirement!=='MERCHANT_REVIEW_REQUIRED')throw new IntakeError('NOTE_ALREADY_REVIEWED');
   if(!matchingSessions(catalog,[pref],group.target_size).some(s=>s.offeringId===p.offeringId&&s.slotId===p.slotId))throw new IntakeError('NO_VALID_CANDIDATE');
   if((await c.query('SELECT 1 FROM studio_questions WHERE member_id=$1 AND source_preference_id=$2',[member.id,p.sourcePreferenceId])).rowCount)throw new IntakeError('QUESTION_PENDING');
   await retireInterruptedDrafts(c,member.id);
   // User/group locks above serialize reservations across tabs and command IDs.
   // Reuse only the same member, saved revision and exact selected session.
   const pending=(await c.query("SELECT id FROM studio_question_drafts WHERE member_id=$1 AND source_preference_id=$2 AND offering_id=$3 AND slot_id=$4 AND status IN ('RESERVED','DISPATCHED') AND expires_at>clock_timestamp() ORDER BY created_at,id LIMIT 1",[member.id,p.sourcePreferenceId,p.offeringId,p.slotId])).rows[0];
   if(pending)return {id:pending.id as string};
   if(member.ai_calls>=4||await dailyAiCalls(c,a.userId)>=6)throw new IntakeError('CLARIFICATION_LIMIT');
   const id=randomUUID();await c.query("INSERT INTO studio_question_drafts(id,member_id,source_preference_id,offering_id,slot_id,status) VALUES($1,$2,$3,$4,$5,'RESERVED')",[id,member.id,p.sourcePreferenceId,p.offeringId,p.slotId]);
   await c.query('UPDATE planning_members SET ai_calls=ai_calls+1 WHERE id=$1',[member.id]);return {id};
  });
  const input=await transaction(this.pool,async c=>{
   const {group,member}=await this.owned(c,a,p.groupId);await retireInterruptedDrafts(c,member.id);
   const row=(await c.query('SELECT *,expires_at>clock_timestamp() AS fresh FROM studio_question_drafts WHERE id=$1 AND member_id=$2 FOR UPDATE',[reserved.id,member.id])).rows[0];
   if(!row||row.status!=='RESERVED')return null;
   if(!row.fresh||member.current_preference_id!==row.source_preference_id||!member.optional_text||member.private_text_expires_at&&new Date(member.private_text_expires_at).getTime()<=Date.now()||!['COLLECTING','CLOSED','MERCHANT_REVIEW'].includes(group.state)){await c.query("UPDATE studio_question_drafts SET status='STALE' WHERE id=$1",[row.id]);return null;}
   await c.query("UPDATE studio_question_drafts SET status='DISPATCHED' WHERE id=$1",[row.id]);
   const catalog=catalogSchema.parse(group.catalog);return {revisionId:row.id,text:member.optional_text as string,catalog:{...catalog,offerings:catalog.offerings.filter(o=>o.id===p.offeringId)}};
  });
  if(input){let result:QuestionDraft;try{result=await this.model(input);}catch{result={status:'NEEDS_REVIEW',reason:'UNAVAILABLE'};}
   await transaction(this.pool,async c=>{
    const {group,member}=await this.owned(c,a,p.groupId);const row=(await c.query('SELECT *,expires_at>clock_timestamp() AS fresh FROM studio_question_drafts WHERE id=$1 FOR UPDATE',[reserved.id])).rows[0];if(!row||row.status!=='DISPATCHED')return;
    if(!row.fresh||member.current_preference_id!==row.source_preference_id||!['COLLECTING','CLOSED','MERCHANT_REVIEW'].includes(group.state)||member.optional_text!==input.text||member.private_text_expires_at&&new Date(member.private_text_expires_at).getTime()<=Date.now()){await c.query("UPDATE studio_question_drafts SET status='STALE',result=NULL WHERE id=$1",[row.id]);return;}
    let question:string|null=null,reviewReason:'UNAVAILABLE'|'REVIEW'=result.status==='NEEDS_REVIEW'&&result.reason==='REVIEW'?'REVIEW':'UNAVAILABLE';
    try{if(result.status==='QUESTION_DRAFT'){question=questionFromEvidence(validateQuestionEvidence(result.draft,input));checkQuestionPrivacy(question,(await c.query('SELECT display_name FROM planning_members WHERE group_id=$1',[group.id])).rows.map(r=>r.display_name));}}catch(e){question=null;if(e instanceof IntakeError&&e.code==='QUESTION_PRIVACY')reviewReason='REVIEW';}
    await c.query('UPDATE studio_question_drafts SET status=$2,result=$3 WHERE id=$1',[row.id,question?'READY':'REVIEW',JSON.stringify(question?{question}:{reviewReason})]);
   });
  }
  return transaction(this.pool,async c=>{const {member}=await this.owned(c,a,p.groupId);
   // A terminated request is unavailable, not a semantic model refusal. This
   // retires the old attempt without redispatch or renewed quota.
   await retireInterruptedDrafts(c,member.id);
   const row=(await c.query('SELECT status,result,source_preference_id,expires_at>clock_timestamp() AS fresh FROM studio_question_drafts WHERE id=$1 AND member_id=$2',[reserved.id,member.id])).rows[0],status=row?.fresh&&member.current_preference_id===row.source_preference_id?row.status as string:'STALE';
   return {id:reserved.id,status,question:status==='READY'?row.result?.question as string:null,reviewReason:status==='REVIEW'?(row.result?.reviewReason==='REVIEW'?'REVIEW' as const:'UNAVAILABLE' as const):null};
  });
 }
}
