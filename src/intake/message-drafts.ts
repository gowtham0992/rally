import {randomUUID} from 'node:crypto';
import type pg from 'pg';
import {z} from 'zod';
import {transaction} from '../db.ts';
import {assertWorkspaceScope} from '../demo/scope.ts';
import {clarify,type Clarification} from '../ai/clarifier.ts';
import {validateInterpretation} from '../planning/interpretation.ts';
import {reviewDraftProposal} from '../planning/draft.ts';
import type {Proposal} from '../planning/meaning.ts';
import {IntakeService,IntakeError,type IntakeActor} from './service.ts';
import {dailyAiCalls} from './ai-allowance.ts';
import {reviewDetails,storedReview,type ReviewDetails} from '../planning/review-details.ts';
const startSchema=z.strictObject({commandId:z.uuid(),groupId:z.uuid(),sourcePreferenceId:z.uuid().nullable(),text:z.string().trim().min(1).max(1500),modelProcessingAgreed:z.literal(true),retryDraftId:z.uuid().optional()});
const discardSchema=z.strictObject({commandId:z.uuid(),groupId:z.uuid(),sourcePreferenceId:z.uuid().nullable(),draftId:z.uuid()});
type Input={revisionId:string;text:string;catalog:unknown};
export type MessageDraftView={id:string;sourcePreferenceId:string|null;text:string;status:string;proposal:Proposal|null;review?:ReviewDetails};
export class MessageDraftService{
 private intake:IntakeService;
 constructor(private pool:pg.Pool,private model:(input:Input)=>Promise<Clarification>=input=>clarify(input,undefined,fetch,undefined,true)){this.intake=new IntakeService(pool);}
 private async owned(c:pg.PoolClient,a:IntakeActor,groupId:string){
  z.uuid().parse(a.userId);z.uuid().parse(groupId);if(a.emailVerified!==true)throw new IntakeError('VERIFIED_IDENTITY_REQUIRED');
  const group=(await c.query('SELECT * FROM planning_groups WHERE id=$1 FOR UPDATE',[groupId])).rows[0];if(!group)throw new IntakeError('NOT_FOUND');assertWorkspaceScope(a,group);
  const member=(await c.query('SELECT * FROM planning_members WHERE group_id=$1 AND user_id=$2',[groupId,a.userId])).rows[0];
  if(!member||member.excluded||(group.state!=='COLLECTING'&&!member.admitted))throw new IntakeError('NOT_FOUND');
  return {group,member};
 }
 private editable(group:any){if(!['COLLECTING','CLOSED','MERCHANT_REVIEW'].includes(group.state))throw new IntakeError('PLANNING_LOCKED');}
 async view(a:IntakeActor,groupId:string):Promise<MessageDraftView|null>{return transaction(this.pool,async c=>{
  const {group,member}=await this.owned(c,a,groupId);
  const row=(await c.query('SELECT *,expires_at>clock_timestamp() AS fresh FROM intake_message_drafts WHERE member_id=$1 AND source_preference_id IS NOT DISTINCT FROM $2 ORDER BY created_at DESC,id DESC LIMIT 1 FOR UPDATE',[member.id,member.current_preference_id])).rows[0];
  if(!row)return null;
  if(row.status==='STALE'&&!row.text_value)return null;
  if(!row.fresh){await c.query("UPDATE intake_message_drafts SET text_value=NULL,result=NULL,status=CASE WHEN status='CONFIRMED' THEN status ELSE 'STALE' END WHERE id=$1",[row.id]);return null;}
  if(!['COLLECTING','CLOSED','MERCHANT_REVIEW'].includes(group.state)){await c.query("UPDATE intake_message_drafts SET result=NULL,status='STALE' WHERE id=$1",[row.id]);return null;}
  if(['RESERVED','DISPATCHED'].includes(row.status)&&(await c.query("UPDATE intake_message_drafts SET status='REVIEW',result=$2 WHERE id=$1 AND coalesce(started_at,created_at)<clock_timestamp()-interval '45 seconds' RETURNING id",[row.id,JSON.stringify(reviewDetails(null))])).rowCount){row.status='REVIEW';row.result=reviewDetails(null);}
  return {id:row.id,sourcePreferenceId:row.source_preference_id,text:row.text_value,status:row.status,proposal:row.status==='READY'?row.result:null,...row.status==='REVIEW'&&row.result?.reviewReason?{review:storedReview(row.result)}:{}};
 });}
 async discard(a:IntakeActor,value:unknown){const p=discardSchema.parse(value);return this.intake.recordCommand(a,p.commandId,{kind:'DISCARD_MESSAGE_DRAFT',...p},async c=>{
  const {member}=await this.owned(c,a,p.groupId);if(member.current_preference_id!==p.sourcePreferenceId)throw new IntakeError('STALE_PREFERENCE');
  const latest=(await c.query('SELECT id,status FROM intake_message_drafts WHERE member_id=$1 AND source_preference_id IS NOT DISTINCT FROM $2 ORDER BY created_at DESC,id DESC LIMIT 1 FOR UPDATE',[member.id,p.sourcePreferenceId])).rows[0];
  if(latest?.id!==p.draftId||latest.status==='CONFIRMED')throw new IntakeError('STALE_DRAFT');
  // Keep quota metadata. Cancel all superseded work for this source so an older
  // retry cannot reappear; a later draft or changed saved preference is fenced.
  await c.query("UPDATE intake_message_drafts SET status='STALE',text_value=NULL,result=NULL WHERE member_id=$1 AND source_preference_id IS NOT DISTINCT FROM $2 AND status<>'CONFIRMED'",[member.id,p.sourcePreferenceId]);
  return {discarded:true};
 });}
 async start(a:IntakeActor,value:unknown){
  const p=startSchema.parse(value);
  const reserved=await this.intake.recordCommand(a,p.commandId,{kind:'DRAFT_MESSAGE',...p},async c=>{
   await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,71))',[a.userId]);
   const {group,member}=await this.owned(c,a,p.groupId);this.editable(group);
   if(member.current_preference_id!==p.sourcePreferenceId)throw new IntakeError('STALE_PREFERENCE');
   const prior=(await c.query("SELECT id,status,result FROM intake_message_drafts WHERE member_id=$1 AND source_preference_id IS NOT DISTINCT FROM $2 AND text_value=$3 AND expires_at>clock_timestamp() ORDER BY created_at DESC LIMIT 1",[member.id,p.sourcePreferenceId,p.text])).rows[0];
   if(p.retryDraftId){if(prior?.id!==p.retryDraftId||prior.status!=='REVIEW'||storedReview(prior.result).reviewReason!=='UNAVAILABLE')throw new IntakeError('STALE_DRAFT');}
   else if(prior)return {id:prior.id};
   if(member.ai_calls>=4||member.ai_questions>=2||await dailyAiCalls(c,a.userId)>=6)throw new IntakeError('CLARIFICATION_LIMIT');
   const id=randomUUID();await c.query("INSERT INTO intake_message_drafts(id,member_id,source_preference_id,text_value,status) VALUES($1,$2,$3,$4,'RESERVED')",[id,member.id,p.sourcePreferenceId,p.text]);
   await c.query('UPDATE planning_members SET ai_calls=ai_calls+1 WHERE id=$1',[member.id]);return {id};
  });
  const input=await transaction(this.pool,async c=>{
   const {group,member}=await this.owned(c,a,p.groupId);this.editable(group);
   const row=(await c.query('SELECT *,expires_at>clock_timestamp() AS fresh FROM intake_message_drafts WHERE id=$1 AND member_id=$2 FOR UPDATE',[reserved.id,member.id])).rows[0];
   if(!row)throw new IntakeError('NOT_FOUND');if(row.status!=='RESERVED')return null;
   if(!row.fresh||member.current_preference_id!==row.source_preference_id){await c.query("UPDATE intake_message_drafts SET status='STALE',result=NULL WHERE id=$1",[row.id]);return null;}
   await c.query("UPDATE intake_message_drafts SET status='DISPATCHED',started_at=clock_timestamp() WHERE id=$1",[row.id]);
   return {revisionId:row.id,text:row.text_value as string,catalog:group.catalog};
  });
  if(input){
   let result:Clarification;try{result=await this.model(input);}catch{result={status:'NEEDS_REVIEW'};}
   await transaction(this.pool,async c=>{
    const {group,member}=await this.owned(c,a,p.groupId);
    const row=(await c.query('SELECT *,expires_at>clock_timestamp() AS fresh FROM intake_message_drafts WHERE id=$1 AND member_id=$2 FOR UPDATE',[reserved.id,member.id])).rows[0];
    if(!row||row.status!=='DISPATCHED')return;
    if(!row.fresh||member.current_preference_id!==row.source_preference_id||!['COLLECTING','CLOSED','MERCHANT_REVIEW'].includes(group.state)){await c.query("UPDATE intake_message_drafts SET status='STALE',result=NULL WHERE id=$1",[row.id]);return;}
    let proposal:Proposal|null=null,validated:Proposal|null=null;try{if(result.status==='PROPOSAL'){validated=validateInterpretation(result.proposal,input);proposal=reviewDraftProposal(validated);}}catch{proposal=null;}
    if(proposal?.question&&!(await c.query('UPDATE planning_members SET ai_questions=ai_questions+1 WHERE id=$1 AND ai_questions<2 RETURNING id',[member.id])).rowCount)proposal=null;
    await c.query('UPDATE intake_message_drafts SET status=$2,result=$3 WHERE id=$1',[row.id,proposal?'READY':'REVIEW',JSON.stringify(proposal??reviewDetails(validated))]);
   });
  }
  // Return this command's record, not a newer message started in another tab.
  const latest=await this.view(a,p.groupId);return latest?.id===reserved.id?latest:null;
 }
}
