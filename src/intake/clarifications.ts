import {dailyAiCalls} from './ai-allowance.ts';
import {assertWorkspaceScope} from '../demo/scope.ts';
import {randomUUID} from 'node:crypto';
import type pg from 'pg';
import {z} from 'zod';
import {transaction} from '../db.ts';
import {clarify,type Clarification} from '../ai/clarifier.ts';
import {validateInterpretation} from '../planning/interpretation.ts';
import {preferenceSchema} from '../planning/domain.ts';
import {answerConsequences,type AnswerConsequence} from '../planning/consequences.ts';
import {confirmedMeaning,reviewProposal,type Proposal,type MeaningBound} from '../planning/meaning.ts';
import {IntakeService,IntakeError,type IntakeActor} from './service.ts';
import {reviewDetails,storedReview,type ReviewDetails} from '../planning/review-details.ts';
const base={commandId:z.uuid(),groupId:z.uuid(),expectedRevision:z.number().int().nonnegative(),preferenceId:z.uuid()};
const startSchema=z.strictObject({...base,modelProcessingAgreed:z.literal(true),retryClarificationId:z.uuid().optional()});
const answerSchema=z.strictObject({...base,clarificationId:z.uuid(),answerId:z.string().min(1).max(50).nullable(),confirmsAllEssentials:z.literal(true)});
const structuredSchema=z.strictObject({...base,declaresNoAdditionalMustHaves:z.literal(true)});
const declineSchema=z.strictObject({...base,clarificationId:z.uuid()});
type Model=(input:{revisionId:string;text:string;catalog:unknown})=>Promise<Clarification>;
export type ClarificationView={id:string;status:string;sourcePreferenceId:string;sourceGroupRevision:number;proposal:Proposal|null;questionsRemaining:number;consequences:AnswerConsequence[];review?:ReviewDetails};
export class ClarificationService {
 private intake:IntakeService;
 constructor(private pool:pg.Pool,private model:Model=clarify){this.intake=new IntakeService(pool);}
 private actor(a:IntakeActor){z.uuid().parse(a.userId);if(!a.emailVerified)throw new IntakeError('VERIFIED_IDENTITY_REQUIRED');}
 private async owned(c:pg.PoolClient,a:IntakeActor,id:string){
  this.actor(a);z.uuid().parse(id);
  const group=(await c.query('SELECT * FROM planning_groups WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!group)throw new IntakeError('NOT_FOUND');assertWorkspaceScope(a,group);
  const member=(await c.query(`SELECT m.*,p.confirmed,p.optional_text,p.wording_bound,
   coalesce((to_jsonb(p)->>'private_text_expires_at')::timestamptz<=clock_timestamp(),false) AS private_text_expired
   FROM planning_members m LEFT JOIN preference_revisions p ON p.id=m.current_preference_id WHERE m.group_id=$1 AND m.user_id=$2`,[id,a.userId])).rows[0];
  if(!member||member.excluded||(group.state!=='COLLECTING'&&!member.admitted))throw new IntakeError('NOT_FOUND');
  if(member.private_text_expired)member.optional_text=null;
  return {group,member};
 }
 private editable(group:any){if(!['COLLECTING','CLOSED','MERCHANT_REVIEW'].includes(group.state))throw new IntakeError('PLANNING_LOCKED');}
 private current(group:any,member:any,p:{expectedRevision:number;preferenceId:string}){if(member.current_preference_id!==p.preferenceId)throw new IntakeError('STALE_REVISION');}
 async view(a:IntakeActor,groupId:string):Promise<ClarificationView|null>{return transaction(this.pool,async c=>{
  const {group,member}=await this.owned(c,a,groupId);
  const row=(await c.query(`SELECT * FROM planning_clarifications WHERE member_id=$1 AND (source_preference_id=$2 OR resolved_preference_id=$2) ORDER BY created_at DESC LIMIT 1`,[member.id,member.current_preference_id])).rows[0];
  if(!row)return null;
  if(member.private_text_expired){
   await c.query("UPDATE planning_clarifications SET result=NULL,status=CASE WHEN status IN ('RESERVED','DISPATCHED','READY') THEN 'STALE' ELSE status END WHERE id=$1",[row.id]);
   row.result=null;if(['RESERVED','DISPATCHED','READY'].includes(row.status))row.status='STALE';
  }
  if(['RESERVED','DISPATCHED','READY'].includes(row.status)&&(!['COLLECTING','CLOSED','MERCHANT_REVIEW'].includes(group.state)||row.source_preference_id!==member.current_preference_id)){
   await c.query("UPDATE planning_clarifications SET status='STALE',result=NULL WHERE id=$1",[row.id]);row.status='STALE';row.result=null;
  }
  if(['RESERVED','DISPATCHED'].includes(row.status)){
   const expired=(await c.query("UPDATE planning_clarifications SET status='REVIEW',result=$2 WHERE id=$1 AND clock_timestamp()>coalesce(started_at,created_at)+interval '45 seconds' RETURNING id",[row.id,JSON.stringify(reviewDetails(null))])).rowCount;
   if(expired){row.status='REVIEW';row.result=reviewDetails(null);}
  }
  const proposal:Proposal|null=row.status==='READY'?row.result:null;
  const consequences=proposal?answerConsequences(group.catalog,preferenceSchema.parse(member.confirmed),proposal,group.target_size):[];
  return {id:row.id,status:row.status,sourcePreferenceId:row.source_preference_id,sourceGroupRevision:row.source_group_revision,proposal,questionsRemaining:2-member.ai_questions,consequences,...row.status==='REVIEW'&&row.result?.reviewReason?{review:storedReview(row.result)}:{}};
 });}
 async start(a:IntakeActor,value:unknown){
  const p=startSchema.parse(value);
  const reserved=await this.intake.recordCommand(a,p.commandId,{kind:'START_CLARIFICATION',...p},async c=>{
   // Serialize the daily allowance across this actor's different groups.
   await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,71))',[a.userId]);
   const {group,member}=await this.owned(c,a,p.groupId);this.editable(group);this.current(group,member,p);
   if(!member.optional_text?.trim())throw new IntakeError('NO_NOTE');
   if(member.optional_text.length>1500)throw new IntakeError('NOTE_TOO_LONG');
   if(member.wording_bound)throw new IntakeError('NOTE_ALREADY_REVIEWED');
   const prior=(await c.query('SELECT id,status,result FROM planning_clarifications WHERE member_id=$1 AND source_preference_id=$2 ORDER BY created_at DESC LIMIT 1',[member.id,p.preferenceId])).rows[0];
   if(p.retryClarificationId){if(prior?.id!==p.retryClarificationId||prior.status!=='REVIEW'||storedReview(prior.result).reviewReason!=='UNAVAILABLE')throw new IntakeError('STALE_CLARIFICATION');}
   else if(prior)return {id:prior.id};
   const daily=await dailyAiCalls(c,a.userId);
   if(member.ai_calls>=4||member.ai_questions>=2||daily>=6)throw new IntakeError('CLARIFICATION_LIMIT');
   const id=randomUUID();await c.query('INSERT INTO planning_clarifications(id,member_id,source_preference_id,source_group_revision,status) VALUES($1,$2,$3,$4,\'RESERVED\')',[id,member.id,p.preferenceId,group.revision]);
   await c.query('UPDATE planning_members SET ai_calls=ai_calls+1 WHERE id=$1',[member.id]);return {id};
  });
  const input=await transaction(this.pool,async c=>{
   const {group,member}=await this.owned(c,a,p.groupId);this.editable(group);
   const row=(await c.query('SELECT * FROM planning_clarifications WHERE id=$1 AND member_id=$2 FOR UPDATE',[reserved.id,member.id])).rows[0];if(!row)throw new IntakeError('NOT_FOUND');
   if(row.status!=='RESERVED')return null;
   if(member.private_text_expired||!member.optional_text?.trim()||!['COLLECTING','CLOSED','MERCHANT_REVIEW'].includes(group.state)||row.source_preference_id!==member.current_preference_id){await c.query("UPDATE planning_clarifications SET status='STALE',result=NULL WHERE id=$1",[row.id]);return null;}
   await c.query("UPDATE planning_clarifications SET status='DISPATCHED',started_at=clock_timestamp() WHERE id=$1",[row.id]);
   return {revisionId:member.current_preference_id,text:member.optional_text,catalog:group.catalog};
  });
  if(input){
   let result:Clarification;try{result=await this.model(input);}catch{result={status:'NEEDS_REVIEW'};}
   await transaction(this.pool,async c=>{
    const {group,member}=await this.owned(c,a,p.groupId);
    const row=(await c.query('SELECT * FROM planning_clarifications WHERE id=$1 AND member_id=$2 FOR UPDATE',[reserved.id,member.id])).rows[0];if(row.status!=='DISPATCHED')return;
    if(member.private_text_expired||member.current_preference_id!==row.source_preference_id||!['COLLECTING','CLOSED','MERCHANT_REVIEW'].includes(group.state)){
     await c.query("UPDATE planning_clarifications SET status='STALE',result=NULL WHERE id=$1",[row.id]);return;
    }
    let proposal:Proposal|null=null,validated:Proposal|null=null;
    if(result.status==='PROPOSAL')try{
     validated=validateInterpretation(result.proposal,input);proposal=reviewProposal(validated,preferenceSchema.parse(member.confirmed),group.catalog,group.target_size);
     if(proposal?.question){
      const allowed=(await c.query('UPDATE planning_members SET ai_questions=ai_questions+1 WHERE id=$1 AND ai_questions<2 RETURNING id',[member.id])).rowCount;
      if(!allowed)proposal=null;
     }
    }catch{proposal=null;}
    await c.query('UPDATE planning_clarifications SET status=$2,result=$3,question_asked=$4 WHERE id=$1',[row.id,proposal?'READY':'REVIEW',JSON.stringify(proposal??reviewDetails(validated)),Boolean(proposal?.question)]);
   });
  }
  return this.view(a,p.groupId);
 }
 private async persistConfirmed(c:pg.PoolClient,group:any,member:any,preference:ReturnType<typeof preferenceSchema.parse>,bound:MeaningBound|null,kind:string){
  const id=randomUUID();preference.revisionId=id;
  await c.query('INSERT INTO preference_revisions(id,member_id,confirmed,optional_text,wording_bound) VALUES($1,$2,$3,$4,$5)',[id,member.id,JSON.stringify(preference),member.optional_text,bound?JSON.stringify(bound):null]);
  await c.query('UPDATE planning_members SET current_preference_id=$2 WHERE id=$1',[member.id,id]);
  const revision=(await c.query("UPDATE planning_groups SET revision=revision+1,candidate=NULL,state=CASE WHEN state='MERCHANT_REVIEW' THEN 'CLOSED' ELSE state END WHERE id=$1 RETURNING revision",[group.id])).rows[0].revision;
  await c.query('INSERT INTO planning_events(group_id,revision,kind) VALUES($1,$2,$3)',[group.id,revision,kind]);return {preferenceId:id,revision};
 }
 async confirmStructuredNote(a:IntakeActor,value:unknown){const p=structuredSchema.parse(value);return this.intake.recordCommand(a,p.commandId,{kind:'CONFIRM_STRUCTURED_NOTE',...p},async c=>{
  const {group,member}=await this.owned(c,a,p.groupId);this.editable(group);this.current(group,member,p);
  if(!member.optional_text?.trim())throw new IntakeError('NO_NOTE');
  // An explicit human statement that the selected controls are the sole hard
  // requirements. This never makes an unsupported studio capability true.
  const preference=preferenceSchema.parse(member.confirmed);preference.extraRequirement='NONE';
  return this.persistConfirmed(c,group,member,preference,{technique:preference.technique,outcome:preference.outcome,collection:preference.collection,availableSlotIds:preference.availableSlotIds},'STRUCTURED_NOTE_CONFIRMED');
 });}
 async answer(a:IntakeActor,value:unknown){const p=answerSchema.parse(value);return this.intake.recordCommand(a,p.commandId,{kind:'ANSWER_CLARIFICATION',...p},async c=>{
  const {group,member}=await this.owned(c,a,p.groupId);this.editable(group);this.current(group,member,p);
  const row=(await c.query('SELECT * FROM planning_clarifications WHERE id=$1 AND member_id=$2 FOR UPDATE',[p.clarificationId,member.id])).rows[0];if(!row)throw new IntakeError('NOT_FOUND');
  if(row.status!=='READY'||row.source_preference_id!==p.preferenceId)throw new IntakeError('STALE_CLARIFICATION');
  const proposal=validateInterpretation(row.result,{revisionId:p.preferenceId,text:member.optional_text,catalog:group.catalog});
  const question=proposal.question;if((question&&!question.options.some(o=>o.id===p.answerId))||(!question&&p.answerId!==null))throw new IntakeError('INVALID_ANSWER');
  const resolved=confirmedMeaning(preferenceSchema.parse(member.confirmed),proposal,p.answerId);
  const saved=await this.persistConfirmed(c,group,member,resolved.preference,resolved.preference.extraRequirement==='NONE'?resolved.bound:null,'CLARIFICATION_CONFIRMED');
  await c.query("UPDATE planning_clarifications SET status='ANSWERED',resolved_preference_id=$2 WHERE id=$1",[row.id,saved.preferenceId]);return saved;
 });}
 async decline(a:IntakeActor,value:unknown){const p=declineSchema.parse(value);return this.intake.recordCommand(a,p.commandId,{kind:'DECLINE_CLARIFICATION',...p},async c=>{
  const {group,member}=await this.owned(c,a,p.groupId);this.editable(group);this.current(group,member,p);
  const row=(await c.query('SELECT * FROM planning_clarifications WHERE id=$1 AND member_id=$2 FOR UPDATE',[p.clarificationId,member.id])).rows[0];if(!row)throw new IntakeError('NOT_FOUND');
  if(row.status!=='READY'||row.source_preference_id!==p.preferenceId)throw new IntakeError('STALE_CLARIFICATION');
  await c.query("UPDATE planning_clarifications SET status='DECLINED',result=NULL WHERE id=$1",[row.id]);return {declined:true};
 });}
}
