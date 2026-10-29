import { randomUUID,randomBytes,createHash } from 'node:crypto';
import type pg from 'pg';
import { z } from 'zod';
import { transaction } from '../db.ts';
import { fingerprint } from '../payments/types.ts';
import { catalogSchema,preferenceSchema } from '../planning/domain.ts';
import {respectsMeaning,type MeaningBound} from '../planning/meaning.ts';
import { confirmedPlan } from '../planning/persisted.ts';
import type {CollectionRequest,GroupMember} from './projections.ts';
import {publishedGroupSizes} from '../planning/capacity.ts';
import {assertWorkspaceScope} from '../demo/scope.ts';
import {confirmedDraft} from './draft-confirmation.ts';
import {nextStep,type NextStep} from '../planning/next-step.ts';
import {privateFeedback} from '../planning/private-feedback.ts';
import {localFields} from '../planning/local-time.ts';
import {withdrawalForGroup} from './withdrawal.ts';
import {storedReview} from '../planning/review-details.ts';

// Only server-authenticated identity may construct this input. Request bodies must
// never supply actorId/verified. Managed Auth route binding remains a separate gate.
export interface IntakeActor {userId:string;emailVerified:boolean;demoWorkspaceId?:string}
export type CollectionNextStep='ASK_COLLECTOR'|'REVIEW_REQUEST'|'CHOOSE_COLLECTOR';
export interface RequestedSession {activity:string;startAt:string;timezone:string;amountMinor:number}
export interface StudioDecline {reason:string;catalogVersionId:string;offeringId:string;slotId:string;activity:string;startAt:string;timezone:string}
export interface PlanSummary {nextStep?:NextStep;groupId:string;studioName:string;state:string;isOrganizer:boolean;targetSize:number;readyCount:number;ownReady:boolean;excluded?:boolean;ownNoteNeedsReview:boolean;studioDeclined:boolean;studioReviewNeedsRefresh:boolean;noSharedSession:boolean;collectionNextStep:CollectionNextStep|null;deadline:string|null;amountMinor:number|null;activity:string|null;startAt:string|null;timezone:string|null;bookingState:string|null;bookingCleanup:string|null;offerId:string|null;previousOfferId:string|null;members:{displayName:string;isYou:boolean}[]}
export class IntakeError extends Error {constructor(public code:string){super(code);}}
const uuid=z.uuid(),name=z.string().trim().min(1).max(60);
const createSchema=z.strictObject({commandId:uuid,targetSize:z.number().int().min(1).max(8).optional(),displayName:name,catalog:catalogSchema});
const joinSchema=z.strictObject({commandId:uuid,invite:z.string().regex(/^[a-f0-9]{64}$/),displayName:name});
const saveSchema=z.strictObject({commandId:uuid,groupId:uuid,expectedRevision:z.number().int().nonnegative(),expectedPreferenceId:uuid.nullable(),
 preference:preferenceSchema.omit({memberId:true,revisionId:true}),optionalText:z.string().max(2000).nullable(),
 messageDraft:z.strictObject({id:z.uuid(),answerId:z.string().min(1).max(50).nullable(),confirmsAllEssentials:z.literal(true)}).optional(),declaresNoAdditionalMustHaves:z.literal(true).optional(),studioContactConfirmed:z.literal(true).optional()});
const participationSchema=z.strictObject({commandId:uuid,groupId:uuid,expectedRevision:z.number().int().nonnegative(),offerId:uuid,coming:z.boolean()});
const closeSchema=z.strictObject({commandId:uuid,groupId:uuid,expectedRevision:z.number().int().nonnegative(),memberIds:z.array(uuid).min(1).max(8)});
const nominateSchema=z.strictObject({commandId:uuid,groupId:uuid,expectedPreferenceId:uuid,nomineeMemberId:uuid,disclosureAgreed:z.literal(true)});
const consentCommandSchema=z.strictObject({commandId:uuid,groupId:uuid,expectedRevision:z.number().int().nonnegative(),preferenceId:uuid,action:z.enum(['OWNER_AGREE','NOMINEE_AGREE','REVOKE']),disclosureAgreed:z.boolean()});
const digest=(s:string)=>createHash('sha256').update(s).digest('hex');
export class IntakeService {
 constructor(private pool:pg.Pool){}
 private actor(a:IntakeActor){uuid.parse(a.userId);if(a.demoWorkspaceId)uuid.parse(a.demoWorkspaceId);if(a.emailVerified!==true)throw new IntakeError('VERIFIED_IDENTITY_REQUIRED');}
 async recordCommand<T>(actor:IntakeActor,id:string,payload:unknown,fn:(c:pg.PoolClient)=>Promise<T>):Promise<T>{
  this.actor(actor);const hash=fingerprint(actor.demoWorkspaceId?{workspaceId:actor.demoWorkspaceId,payload}:payload);
  return transaction(this.pool,async c=>{
   // Global command lock makes lost-response retries single-effect, including creation.
   await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[id]);
   const prior=(await c.query('SELECT actor_id,fingerprint,result FROM intake_commands WHERE id=$1',[id])).rows[0];
   if(prior){if(prior.actor_id!==actor.userId||prior.fingerprint!==hash)throw new IntakeError('COMMAND_CONFLICT');return prior.result as T;}
   const result=await fn(c);
   await c.query('INSERT INTO intake_commands VALUES($1,$2,$3,$4)',[id,actor.userId,hash,JSON.stringify(result)]);return result;
  });
 }
 private async group(c:pg.PoolClient,id:string,actor:IntakeActor){const row=(await c.query('SELECT * FROM planning_groups WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!row)throw new IntakeError('NOT_FOUND');assertWorkspaceScope(actor,row);return row;}
 private async changed(c:pg.PoolClient,id:string,kind:string){
  const row=(await c.query("UPDATE planning_groups SET revision=revision+1,candidate=NULL,state=CASE WHEN state='MERCHANT_REVIEW' THEN 'CLOSED' ELSE state END WHERE id=$1 RETURNING revision",[id])).rows[0];
  await c.query('INSERT INTO planning_events(group_id,revision,kind) VALUES($1,$2,$3)',[id,row.revision,kind]);return row.revision as number;
 }
 async create(actor:IntakeActor,value:unknown){const p=createSchema.parse(value);return this.recordCommand(actor,p.commandId,{kind:'CREATE',...p},async c=>{
  const groupId=randomUUID(),memberId=randomUUID(),invite=randomBytes(32).toString('hex');
  await c.query('INSERT INTO planning_groups(id,organizer_id,invite_digest,target_size,catalog) VALUES($1,$2,$3,$4,$5)',[groupId,actor.userId,digest(invite),(p.targetSize??publishedGroupSizes(p.catalog)[0]),JSON.stringify(p.catalog)]);
  if(actor.demoWorkspaceId){
   const workspace=(await c.query('SELECT w.catalog FROM demo_workspaces w JOIN demo_identities d ON d.workspace_id=w.id WHERE w.id=$1 AND d.user_id=$2',[actor.demoWorkspaceId,actor.userId])).rows[0];
   if(!workspace||fingerprint(workspace.catalog)!==fingerprint(p.catalog))throw new IntakeError('NOT_FOUND');
   await c.query('UPDATE planning_groups SET demo_workspace_id=$2 WHERE id=$1',[groupId,actor.demoWorkspaceId]);
  }
  await c.query('INSERT INTO planning_members(id,group_id,user_id,display_name) VALUES($1,$2,$3,$4)',[memberId,groupId,actor.userId,p.displayName]);
  return {groupId,memberId,invite,revision:0};
 });}
 async invitationPreview(invite:unknown){
  const token=z.string().regex(/^[a-f0-9]{64}$/).parse(invite);
  const row=(await this.pool.query(`SELECT m.display_name,g.catalog->>'studioName' AS studio_name
   FROM planning_groups g JOIN planning_members m ON m.group_id=g.id AND m.user_id=g.organizer_id
   WHERE g.invite_digest=$1 AND g.state='COLLECTING' AND to_jsonb(g)->>'demo_workspace_id' IS NULL`,[digest(token)])).rows[0];
  if(!row)throw new IntakeError('NOT_FOUND');return {organizerName:row.display_name as string,studioName:row.studio_name as string};
 }
 async join(actor:IntakeActor,value:unknown){const p=joinSchema.parse(value);return this.recordCommand(actor,p.commandId,{kind:'JOIN',...p},async c=>{
  const g=(await c.query('SELECT * FROM planning_groups WHERE invite_digest=$1 FOR UPDATE',[digest(p.invite)])).rows[0];
  if(!g)throw new IntakeError('NOT_FOUND');assertWorkspaceScope(actor,g);
  const prior=(await c.query("SELECT id,admitted,coalesce((to_jsonb(m)->>'excluded')::boolean,false) AS excluded FROM planning_members m WHERE group_id=$1 AND user_id=$2",[g.id,actor.userId])).rows[0];
  if(prior&&(g.state==='COLLECTING'||prior.admitted||prior.excluded))return {groupId:g.id,memberId:prior.id,revision:g.revision};
  if(g.state!=='COLLECTING')throw new IntakeError('ROSTER_CLOSED');
  if(Number((await c.query("SELECT count(*) FROM planning_members m WHERE group_id=$1 AND NOT coalesce((to_jsonb(m)->>'excluded')::boolean,false)",[g.id])).rows[0].count)>=8||Number((await c.query('SELECT count(*) FROM planning_members WHERE group_id=$1',[g.id])).rows[0].count)>=32)throw new IntakeError('GROUP_FULL');
  const memberId=randomUUID();await c.query('INSERT INTO planning_members(id,group_id,user_id,display_name) VALUES($1,$2,$3,$4)',[memberId,g.id,actor.userId,p.displayName]);
  return {groupId:g.id,memberId,revision:await this.changed(c,g.id,'MEMBER_JOINED')};
 });}
 async save(actor:IntakeActor,value:unknown){const p=saveSchema.parse(value);return this.recordCommand(actor,p.commandId,{kind:'SAVE',...p},async c=>{
  const g=await this.group(c,p.groupId,actor);
  const m=(await c.query(`SELECT m.id,m.current_preference_id,m.admitted,coalesce((to_jsonb(m)->>'excluded')::boolean,false) AS excluded,p.wording_bound,
   CASE WHEN coalesce((to_jsonb(p)->>'private_text_expires_at')::timestamptz<=clock_timestamp(),false) THEN NULL ELSE p.optional_text END AS optional_text
   FROM planning_members m LEFT JOIN preference_revisions p ON p.id=m.current_preference_id WHERE m.group_id=$1 AND m.user_id=$2`,[p.groupId,actor.userId])).rows[0];
  if(!m||m.excluded)throw new IntakeError('NOT_FOUND');
  if(!['COLLECTING','CLOSED','MERCHANT_REVIEW'].includes(g.state))throw new IntakeError('PLANNING_LOCKED');
  if(g.state!=='COLLECTING'&&!m.admitted)throw new IntakeError('NOT_FOUND');
  if(m.current_preference_id!==p.expectedPreferenceId)throw new IntakeError('STALE_REVISION');
  const catalog=catalogSchema.parse(g.catalog);
  if(p.preference.availableSlotIds.some(id=>!catalog.slots.some(s=>s.id===id)))throw new IntakeError('UNKNOWN_SLOT');
  if(p.preference.latestFinishAt){
   const finishDate=localFields(p.preference.latestFinishAt,catalog.timezone).date;
   if(!catalog.slots.some(s=>localFields(s.startAt,catalog.timezone).date===finishDate))throw new IntakeError('UNKNOWN_FINISH_DATE');
  }
  if(p.preference.nomineeMemberId){const nominee=(await c.query("SELECT id,admitted FROM planning_members n WHERE group_id=$1 AND id=$2 AND NOT coalesce((to_jsonb(n)->>'excluded')::boolean,false)",[g.id,p.preference.nomineeMemberId])).rows[0];if(!nominee||nominee.id===m.id||(g.state!=='COLLECTING'&&!nominee.admitted))throw new IntakeError('INVALID_NOMINEE');}
  const preferenceId=randomUUID(),confirmed={...p.preference,memberId:m.id,revisionId:preferenceId};
  let wordingBound=p.optionalText===m.optional_text&&m.wording_bound&&!m.wording_bound.studioContact&&respectsMeaning(confirmed,m.wording_bound as MeaningBound)?m.wording_bound:null;
  if(p.optionalText?.trim())confirmed.extraRequirement=wordingBound?'NONE':'MERCHANT_REVIEW_REQUIRED';
  if([p.messageDraft,p.declaresNoAdditionalMustHaves,p.studioContactConfirmed].filter(Boolean).length>1)throw new IntakeError('COMMAND_CONFLICT');
  if(p.messageDraft){wordingBound=await confirmedDraft(c,{id:p.messageDraft.id,answerId:p.messageDraft.answerId,memberId:m.id,sourcePreferenceId:m.current_preference_id,text:p.optionalText,catalog:g.catalog,preference:preferenceSchema.parse(confirmed)});confirmed.extraRequirement='NONE';}
  else if(p.declaresNoAdditionalMustHaves&&p.optionalText?.trim()){
   wordingBound={technique:confirmed.technique,outcome:confirmed.outcome,collection:confirmed.collection,availableSlotIds:confirmed.availableSlotIds};confirmed.extraRequirement='NONE';
  }
  else if(p.studioContactConfirmed){
   if(!p.optionalText?.trim())throw new IntakeError('NO_NOTE');
   if(p.optionalText!==m.optional_text)throw new IntakeError('STALE_PREFERENCE');
   if(m.wording_bound&&!respectsMeaning(confirmed,m.wording_bound as MeaningBound))throw new IntakeError('DRAFT_CHOICES_CHANGED');
   wordingBound={technique:confirmed.technique,outcome:confirmed.outcome,collection:confirmed.collection,availableSlotIds:confirmed.availableSlotIds,
    studioContact:{confirmedByMemberId:m.id,confirmedAt:new Date().toISOString()}};confirmed.extraRequirement='NONE';
  }
  await c.query('INSERT INTO preference_revisions(id,member_id,confirmed,optional_text,wording_bound) VALUES($1,$2,$3,$4,$5)',[preferenceId,m.id,JSON.stringify(confirmed),p.optionalText,wordingBound]);
  await c.query('UPDATE planning_members SET current_preference_id=$1 WHERE id=$2',[preferenceId,m.id]);
  let noteReviewReason:string|null=null;
  if(confirmed.extraRequirement==='MERCHANT_REVIEW_REQUIRED'&&(await c.query("SELECT to_regclass('intake_message_drafts') IS NOT NULL AS present")).rows[0].present){
   const draft=(await c.query("SELECT result FROM intake_message_drafts WHERE member_id=$1 AND source_preference_id IS NOT DISTINCT FROM $2 AND text_value=$3 AND status='REVIEW' AND expires_at>clock_timestamp() ORDER BY created_at DESC,id DESC LIMIT 1",[m.id,m.current_preference_id,p.optionalText])).rows[0];
   if(draft?.result?.reviewReason)noteReviewReason=storedReview(draft.result).reviewReason;
  }
  return {preferenceId,revision:await this.changed(c,g.id,'PREFERENCE_CONFIRMED'),...noteReviewReason?{noteReviewReason}:{}};
 });}
 async ownPreferences(actor:IntakeActor,groupId:string){this.actor(actor);uuid.parse(groupId);
  const group=(await this.pool.query('SELECT * FROM planning_groups WHERE id=$1',[groupId])).rows[0];if(!group)throw new IntakeError('NOT_FOUND');assertWorkspaceScope(actor,group);
  const m=(await this.pool.query(`SELECT p.confirmed,p.wording_bound,
   CASE WHEN coalesce((to_jsonb(p)->>'private_text_expires_at')::timestamptz<=clock_timestamp(),false) THEN NULL ELSE p.optional_text END AS optional_text
   FROM planning_members m LEFT JOIN preference_revisions p ON p.id=m.current_preference_id WHERE m.group_id=$1 AND m.user_id=$2`,[groupId,actor.userId])).rows[0];
  if(!m)throw new IntakeError('NOT_FOUND');return {preference:m.confirmed,optionalText:m.optional_text};
 }
 async participantContext(actor:IntakeActor,groupId:string){this.actor(actor);uuid.parse(groupId);return transaction(this.pool,async c=>{
  const g=await this.group(c,groupId,actor);
  const own=(await c.query(`SELECT m.id,m.display_name,m.admitted,coalesce((to_jsonb(m)->>'excluded')::boolean,false) AS excluded,p.confirmed,p.wording_bound,
   coalesce((to_jsonb(p)->>'private_text_expires_at')::timestamptz<=clock_timestamp(),false) AS private_text_expired,
   CASE WHEN coalesce((to_jsonb(p)->>'private_text_expires_at')::timestamptz<=clock_timestamp(),false) THEN NULL ELSE p.optional_text END AS optional_text
   FROM planning_members m LEFT JOIN preference_revisions p ON p.id=m.current_preference_id WHERE m.group_id=$1 AND m.user_id=$2`,[groupId,actor.userId])).rows[0];
  if(!own||(g.state!=='COLLECTING'&&!own.admitted&&!own.excluded))throw new IntakeError('NOT_FOUND');
  // Names and readiness are public within the group; only this authenticated
  // participant's confirmed fields/text enter this private response.
  const members=own.excluded?[{id:own.id,displayName:own.display_name,admitted:false,ready:false,excluded:true,stepStatus:'NOT_COMING' as const}]:await this.memberProgress(c,groupId,g.state==='COLLECTING',g.organizer_id===actor.userId&&['CLOSED','MERCHANT_REVIEW'].includes(g.state));
  const issued=g.state==='OFFER_ISSUED'?(await c.query("SELECT r.approved_offer_id,o.state AS booking_state,o.cleanup,s.snapshot->'candidate'->>'amountMinor' AS amount,s.snapshot->>'deadline' AS deadline FROM merchant_requests r JOIN offers o ON o.id=r.approved_offer_id JOIN offer_snapshots s ON s.offer_id=o.id WHERE r.group_id=$1 AND r.state='APPROVED' ORDER BY r.planning_revision DESC LIMIT 1",[groupId])).rows[0]:null;
  const withdrawal=await withdrawalForGroup(c,groupId),ownWithdrawal=withdrawal?.memberId===own.id;
  const hasDraftTable=(await c.query("SELECT to_regclass('intake_message_drafts') IS NOT NULL AS present")).rows[0].present;
  const draft=hasDraftTable&&!own.excluded?(await c.query("SELECT id FROM intake_message_drafts WHERE member_id=$1 AND source_preference_id IS NOT DISTINCT FROM $2 AND expires_at>clock_timestamp() AND status IN ('RESERVED','DISPATCHED','READY','REVIEW') ORDER BY created_at DESC,id DESC LIMIT 1",[own.id,own.confirmed?.revisionId??null])).rows[0]:null;
  const savedReview=!own.excluded&&own.confirmed?.extraRequirement==='MERCHANT_REVIEW_REQUIRED'?(await c.query("SELECT result->>'noteReviewReason' AS reason FROM intake_commands WHERE actor_id=$1 AND result->>'preferenceId'=$2 AND result->>'noteReviewReason' IN ('UNSUPPORTED','CONFLICT','UNAVAILABLE') LIMIT 1",[actor.userId,own.confirmed.revisionId])).rows[0]?.reason??null:null;
  const ownEarlierOffer=own.excluded?(await c.query("SELECT os.offer_id FROM offer_snapshots os JOIN offers o ON o.id=os.offer_id WHERE os.group_id=$1 AND os.snapshot->'roster' @> $2::jsonb ORDER BY o.opened_at DESC LIMIT 1",[groupId,JSON.stringify([{memberId:own.id}])])).rows[0]?.offer_id??null:null;
  const hadReview=g.state==='CLOSED'&&(await c.query("SELECT 1 FROM planning_events WHERE group_id=$1 AND kind IN ('MERCHANT_REVIEW_REQUESTED','STUDIO_DECLINED') LIMIT 1",[groupId])).rowCount;
  const answer=(hadReview||g.state==='MERCHANT_REVIEW')?(await this.studioAnswers(c,[groupId]))[0]:null;
  return {groupId,revision:g.revision,state:g.state,targetSize:g.target_size,isOrganizer:g.organizer_id===actor.userId,excluded:Boolean(own.excluded),
   memberId:own.id,displayName:own.display_name,preference:!own.excluded&&own.confirmed?preferenceSchema.parse(own.confirmed):null,optionalText:own.excluded?null:own.optional_text??null,wordingReviewed:!own.excluded&&Boolean(own.wording_bound),wordingBound:own.excluded?null:(own.wording_bound??null) as MeaningBound|null,privateTextExpired:Boolean(own.private_text_expired),
   catalog:catalogSchema.parse(g.catalog),members,candidate:own.excluded?null:g.candidate,studioReviewPending:!own.excluded&&g.state==='MERCHANT_REVIEW',requestedSession:!own.excluded&&g.state==='MERCHANT_REVIEW'?answer?.session??null:null,
   hasUnfinishedDraft:Boolean(draft),studioContactConfirmedByYou:!own.excluded&&Boolean(own.wording_bound?.studioContact),
   noteReviewReason:savedReview as 'UNSUPPORTED'|'CONFLICT'|'UNAVAILABLE'|null,
   withdrawal:withdrawal&&(ownWithdrawal||g.organizer_id===actor.userId)?{offerId:withdrawal.offerId,displayName:withdrawal.displayName,isYou:ownWithdrawal,coming:withdrawal.coming}:null,
   offerSummary:!own.excluded&&issued?{amountMinor:Number(issued.amount),deadline:issued.deadline as string,cleanup:issued.cleanup as string}:null,
   previousOfferId:own.excluded?ownEarlierOffer:(await this.previousOffers(c,[groupId]))[0]?.offerId??null,offerId:own.excluded?null:issued?.approved_offer_id??null,bookingState:own.excluded?null:issued?.booking_state??null,studioDecline:own.excluded?null:answer?.decline??null,studioReviewNeedsRefresh:!own.excluded&&g.state==='CLOSED'&&answer?.state==='PENDING',collectionRequests:own.excluded?[]:await this.collectionProjection(c,actor,groupId),
   organizerInvite:g.organizer_id===actor.userId?(await c.query("SELECT result->>'invite' AS invite FROM intake_commands WHERE actor_id=$1 AND result->>'groupId'=$2 AND result ? 'invite' LIMIT 1",[actor.userId,groupId])).rows[0]?.invite??null:null};
 });}
 private async memberProgress(c:pg.PoolClient,groupId:string,collecting:boolean,includeExcluded=false):Promise<GroupMember[]>{
  const rows=(await c.query(`SELECT m.id,m.display_name,m.admitted,m.current_preference_id,p.confirmed,
   coalesce((to_jsonb(m)->>'excluded')::boolean,false) AS excluded,
   g.catalog,g.target_size,
   EXISTS(SELECT 1 FROM collection_consents cs JOIN planning_members n ON n.id=cs.nominee_member_id
    WHERE cs.preference_id=m.current_preference_id AND cs.owner_agreed AND cs.nominee_agreed AND cs.disclosure_agreed AND NOT cs.revoked
     AND NOT coalesce((to_jsonb(n)->>'excluded')::boolean,false)) AS asked,
   EXISTS(SELECT 1 FROM collection_consents cs JOIN planning_members o ON o.id=cs.owner_member_id AND o.current_preference_id=cs.preference_id
    WHERE cs.nominee_member_id=m.id AND cs.owner_agreed AND cs.disclosure_agreed AND NOT cs.nominee_agreed AND NOT cs.revoked
     AND NOT coalesce((to_jsonb(o)->>'excluded')::boolean,false)) AS request_waiting
   FROM planning_members m JOIN planning_groups g ON g.id=m.group_id LEFT JOIN preference_revisions p ON p.id=m.current_preference_id
   WHERE m.group_id=$1 AND ($2 OR m.admitted OR $3 AND coalesce((to_jsonb(m)->>'excluded')::boolean,false)) ORDER BY m.id`,[groupId,collecting,includeExcluded])).rows;
  const withdrawal=await withdrawalForGroup(c,groupId);
  const hasDraftTable=(await c.query("SELECT to_regclass('intake_message_drafts') IS NOT NULL AS present")).rows[0].present;
  const drafts=new Set(hasDraftTable?(await c.query("SELECT d.member_id FROM intake_message_drafts d JOIN planning_members m ON m.id=d.member_id WHERE m.group_id=$1 AND d.source_preference_id IS NOT DISTINCT FROM m.current_preference_id AND d.expires_at>clock_timestamp() AND d.status IN ('RESERVED','DISPATCHED','READY','REVIEW')",[groupId])).rows.map(r=>r.member_id):[]);
  return rows.map(r=>{const p=r.confirmed?preferenceSchema.parse(r.confirmed):null;
   const pending=p&&(Boolean(privateFeedback(catalogSchema.parse(r.catalog),p,r.target_size))||p.extraRequirement!=='NONE'||p.collection==='UNRESOLVED'||p.unresolvedKeys.some(k=>k!=='COLLECTION')||p.collection==='NOMINEE_LATER'&&!r.asked||p.unresolvedKeys.includes('COLLECTION')&&p.collection!=='NOMINEE_LATER')||withdrawal&&withdrawal.memberId===r.id&&withdrawal.coming!==true||drafts.has(r.id);
   return {id:r.id,displayName:r.display_name,admitted:r.admitted,ready:Boolean(p),excluded:r.excluded,stepStatus:r.excluded?'NOT_COMING':!p?'DETAILS_NEEDED':pending||r.request_waiting?'ACTION_NEEDED':'READY'};
  });
 }
 async confirmParticipation(actor:IntakeActor,value:unknown){const p=participationSchema.parse(value);return this.recordCommand(actor,p.commandId,{kind:'PARTICIPATION',...p},async c=>{
  const g=await this.group(c,p.groupId,actor);if(!['COLLECTING','CLOSED'].includes(g.state))throw new IntakeError('PLANNING_LOCKED');if(g.revision!==p.expectedRevision)throw new IntakeError('STALE_REVISION');
  const member=(await c.query('SELECT id FROM planning_members WHERE group_id=$1 AND user_id=$2',[g.id,actor.userId])).rows[0],withdrawal=await withdrawalForGroup(c,g.id);
  if(!member||!withdrawal||withdrawal.memberId!==member.id||withdrawal.offerId!==p.offerId)throw new IntakeError('NOT_FOUND');
  if(!p.coming&&g.organizer_id===actor.userId)throw new IntakeError('ORGANIZER_REQUIRED');
  if(p.coming&&Number((await c.query('SELECT count(*) FROM planning_members WHERE group_id=$1 AND NOT excluded',[g.id])).rows[0].count)>=8&&(await c.query('SELECT excluded FROM planning_members WHERE id=$1',[member.id])).rows[0].excluded)throw new IntakeError('GROUP_FULL');
  if(!p.coming){const invalidated=(await c.query('UPDATE collection_consents SET revoked=true WHERE NOT revoked AND (owner_member_id=$1 OR nominee_member_id=$1) RETURNING preference_id',[member.id])).rows;for(const row of invalidated)await c.query("INSERT INTO collection_consent_events(preference_id,actor_member_id,action) VALUES($1,$2,'ROSTER_INVALIDATED')",[row.preference_id,member.id]);}
  await c.query('UPDATE planning_members SET excluded=$2,admitted=false WHERE id=$1',[member.id,!p.coming]);
  if(g.state==='CLOSED'){await c.query("UPDATE planning_groups SET state='COLLECTING' WHERE id=$1",[g.id]);await c.query('UPDATE planning_members SET admitted=false WHERE group_id=$1',[g.id]);}
  return {kind:'PARTICIPATION_CONFIRMED',memberId:member.id,offerId:p.offerId,coming:p.coming,answeredAt:new Date().toISOString(),revision:await this.changed(c,g.id,'PARTICIPATION_CONFIRMED')};
 });}
 async nominateCollector(actor:IntakeActor,value:unknown){const p=nominateSchema.parse(value);return this.recordCommand(actor,p.commandId,{kind:'ASK_PICKUP',...p},async c=>{
  const g=await this.group(c,p.groupId,actor);if(!['COLLECTING','CLOSED','MERCHANT_REVIEW'].includes(g.state))throw new IntakeError('PLANNING_LOCKED');
  const owner=(await c.query("SELECT m.*,p.confirmed,p.optional_text,p.wording_bound FROM planning_members m JOIN preference_revisions p ON p.id=m.current_preference_id WHERE m.group_id=$1 AND m.user_id=$2 AND NOT coalesce((to_jsonb(m)->>'excluded')::boolean,false)",[g.id,actor.userId])).rows[0];
  if(!owner||(g.state!=='COLLECTING'&&!owner.admitted))throw new IntakeError('NOT_FOUND');if(owner.current_preference_id!==p.expectedPreferenceId)throw new IntakeError('STALE_PREFERENCE');
  const pref=preferenceSchema.parse(owner.confirmed);if(pref.collection!=='NOMINEE_LATER')throw new IntakeError('NO_COLLECTION_ARRANGEMENT');
  const nominee=(await c.query("SELECT id FROM planning_members n WHERE group_id=$1 AND id=$2 AND NOT coalesce((to_jsonb(n)->>'excluded')::boolean,false) AND ($3 OR admitted)",[g.id,p.nomineeMemberId,g.state==='COLLECTING'])).rows[0];
  if(!nominee||nominee.id===owner.id)throw new IntakeError('INVALID_NOMINEE');
  const prior=(await c.query('SELECT * FROM collection_consents WHERE preference_id=$1',[owner.current_preference_id])).rows[0];
  if(pref.nomineeMemberId===nominee.id&&prior?.owner_agreed&&prior.disclosure_agreed&&!prior.revoked)return {preferenceId:owner.current_preference_id as string,revision:g.revision as number};
  const id=randomUUID();pref.revisionId=id;pref.nomineeMemberId=nominee.id;pref.unresolvedKeys=pref.unresolvedKeys.filter(k=>k!=='COLLECTION');
  await c.query(`INSERT INTO preference_revisions(id,member_id,confirmed,optional_text,wording_bound,private_text_expires_at,private_text_redacted_at)
   SELECT $1,$2,$3,CASE WHEN private_text_expires_at<=clock_timestamp() THEN NULL ELSE optional_text END,wording_bound,private_text_expires_at,private_text_redacted_at
   FROM preference_revisions WHERE id=$4`,[id,owner.id,JSON.stringify(pref),owner.current_preference_id]);
  await c.query('UPDATE planning_members SET current_preference_id=$2 WHERE id=$1',[owner.id,id]);
  await c.query('INSERT INTO collection_consents(preference_id,owner_member_id,nominee_member_id,owner_agreed,disclosure_agreed) VALUES($1,$2,$3,true,true)',[id,owner.id,nominee.id]);
  await c.query("INSERT INTO collection_consent_events(preference_id,actor_member_id,action) VALUES($1,$2,'OWNER_AGREE')",[id,owner.id]);
  return {preferenceId:id,revision:await this.changed(c,g.id,'PICKUP_REQUESTED')};
 });}
 async updateRoster(actor:IntakeActor,value:unknown){const p=closeSchema.parse(value);return this.recordCommand(actor,p.commandId,{kind:'UPDATE_ROSTER',...p},async c=>{
  const g=await this.group(c,p.groupId,actor);if(g.organizer_id!==actor.userId)throw new IntakeError('NOT_FOUND');if(!['COLLECTING','CLOSED','MERCHANT_REVIEW'].includes(g.state))throw new IntakeError('PLANNING_LOCKED');if(g.revision!==p.expectedRevision)throw new IntakeError('STALE_REVISION');
  const withdrawal=await withdrawalForGroup(c,g.id);if(withdrawal?.coming===false&&p.memberIds.includes(withdrawal.memberId))throw new IntakeError('PARTICIPATION_REQUIRED');
  if(g.state!=='COLLECTING'&&(await c.query("SELECT 1 FROM offers o JOIN offer_snapshots os ON os.offer_id=o.id WHERE os.group_id=$1 AND (o.state NOT IN ('EXPIRED','WITHDRAWN','SUPERSEDED','ABORTED','CANCELED') OR o.cleanup<>'COMPLETE') LIMIT 1",[g.id])).rowCount)throw new IntakeError('PAYMENT_RECOVERY_REQUIRED');
  const members=(await c.query('SELECT id,user_id,coalesce((to_jsonb(m)->>\'excluded\')::boolean,false) AS excluded FROM planning_members m WHERE group_id=$1',[g.id])).rows;
  if(new Set(p.memberIds).size!==p.memberIds.length||p.memberIds.some(id=>!members.some(m=>m.id===id))||!members.some(m=>m.user_id===actor.userId&&p.memberIds.includes(m.id)))throw new IntakeError('INVALID_ROSTER');
  const sizes=publishedGroupSizes(catalogSchema.parse(g.catalog)),targetSize=sizes.find(size=>size>=p.memberIds.length);if(!targetSize)throw new IntakeError('INVALID_ROSTER');
  const excluded=members.filter(m=>!p.memberIds.includes(m.id)).map(m=>m.id),organizer=members.find(m=>m.user_id===actor.userId)!;
  if(excluded.length){const invalidated=(await c.query('UPDATE collection_consents SET revoked=true WHERE NOT revoked AND (owner_member_id=ANY($1::uuid[]) OR nominee_member_id=ANY($1::uuid[])) RETURNING preference_id',[excluded])).rows;
   for(const cs of invalidated)await c.query("INSERT INTO collection_consent_events(preference_id,actor_member_id,action) VALUES($1,$2,'ROSTER_INVALIDATED')",[cs.preference_id,organizer.id]);}
  await c.query('UPDATE planning_members SET excluded=NOT(id=ANY($2::uuid[])),admitted=false WHERE group_id=$1',[g.id,p.memberIds]);
  await c.query("UPDATE planning_groups SET target_size=$2,state='COLLECTING' WHERE id=$1",[g.id,targetSize]);
  return {targetSize,revision:await this.changed(c,g.id,'ROSTER_UPDATED')};
 });}
 async roster(actor:IntakeActor,groupId:string){this.actor(actor);uuid.parse(groupId);
  const g=(await this.pool.query('SELECT * FROM planning_groups WHERE id=$1',[groupId])).rows[0];if(!g||g.organizer_id!==actor.userId)throw new IntakeError('NOT_FOUND');assertWorkspaceScope(actor,g);
  // This is the ONLY organizer intake projection; budgets and text never enter it.
  const members=(await this.pool.query('SELECT id,display_name AS "displayName",admitted,current_preference_id IS NOT NULL AS ready FROM planning_members WHERE group_id=$1 ORDER BY id',[groupId])).rows;
  return {revision:g.revision,state:g.state,targetSize:g.target_size,members};
 }
 async plans(actor:IntakeActor,cursor:string|null=null):Promise<{plans:PlanSummary[];nextCursor:string|null}>{
  this.actor(actor);if(cursor)uuid.parse(cursor);
  return transaction(this.pool,async c=>{
   let before:{createdAt:string;id:string}|undefined;
   if(cursor){
    before=(await c.query(`SELECT g.created_at::text AS "createdAt",g.id FROM planning_groups g
     JOIN planning_members own ON own.group_id=g.id
     WHERE g.id=$3 AND own.user_id=$1 AND (g.state='COLLECTING' OR own.admitted)
     AND (to_jsonb(g)->>'demo_workspace_id') IS NOT DISTINCT FROM $2::text`,[actor.userId,actor.demoWorkspaceId??null,cursor])).rows[0];
    if(!before)throw new IntakeError('NOT_FOUND');
   }
   // Only membership/readiness, public facts and an owner-only review flag.
   // Never return a preference, invite, candidate or note in this list.
   const rows=(await c.query(`SELECT g.id AS "groupId",g.catalog->>'studioName' AS "studioName",g.state,
    coalesce((to_jsonb(own)->>'excluded')::boolean,false) AS excluded,g.organizer_id=$1 AS "isOrganizer",g.target_size AS "targetSize",own.current_preference_id IS NOT NULL AS "ownReady",
    coalesce(g.state='CLOSED' AND g.candidate->>'state'='INFEASIBLE',false) AS "noSharedSession",
    g.catalog AS _catalog,own.id AS _member_id,own_p.confirmed AS _preference,g.candidate->>'state' AS _candidate_state,
    coalesce(g.state IN ('COLLECTING','CLOSED','MERCHANT_REVIEW') AND NOT coalesce((to_jsonb(own_p)->>'private_text_expires_at')::timestamptz<=clock_timestamp(),false) AND own_p.optional_text IS NOT NULL AND own_p.confirmed->>'extraRequirement'='MERCHANT_REVIEW_REQUIRED',false) AS "ownNoteNeedsReview",
    g.state='CLOSED' AND EXISTS(SELECT 1 FROM planning_events e WHERE e.group_id=g.id AND e.kind='STUDIO_DECLINED') AS "studioDeclined",
    g.state='CLOSED' AND EXISTS(SELECT 1 FROM planning_events e WHERE e.group_id=g.id AND e.kind='MERCHANT_REVIEW_REQUESTED') AS "studioReviewNeedsRefresh",roster."readyCount",roster.members
    FROM planning_groups g JOIN planning_members own ON own.group_id=g.id
    LEFT JOIN preference_revisions own_p ON own_p.id=own.current_preference_id AND own_p.member_id=own.id
    CROSS JOIN LATERAL (SELECT count(*) FILTER(WHERE m.current_preference_id IS NOT NULL)::int AS "readyCount",
     jsonb_agg(jsonb_build_object('displayName',m.display_name,'isYou',m.user_id=$1) ORDER BY m.id) AS members
     FROM planning_members m WHERE m.group_id=g.id AND (g.state='COLLECTING' OR m.admitted) AND (NOT coalesce((to_jsonb(m)->>'excluded')::boolean,false) OR m.id=own.id) AND (NOT coalesce((to_jsonb(own)->>'excluded')::boolean,false) OR m.id=own.id)) roster
    WHERE own.user_id=$1 AND (g.state='COLLECTING' OR own.admitted OR coalesce((to_jsonb(own)->>'excluded')::boolean,false))
    AND (to_jsonb(g)->>'demo_workspace_id') IS NOT DISTINCT FROM $2::text
    AND ($3::timestamptz IS NULL OR (g.created_at,g.id)<($3::timestamptz,$4::uuid))
    ORDER BY g.created_at DESC,g.id DESC LIMIT 21`,[actor.userId,actor.demoWorkspaceId??null,before?.createdAt??null,before?.id??null])).rows as (PlanSummary&{_catalog:unknown;_preference:unknown;_candidate_state:string|null;_member_id:string})[];
   const plans=rows.slice(0,20).map(row=>({...row,collectionNextStep:null as CollectionNextStep|null,deadline:null as string|null,amountMinor:null as number|null,activity:null as string|null,startAt:null as string|null,timezone:null as string|null,bookingState:null as string|null,bookingCleanup:null as string|null,offerId:null as string|null,previousOfferId:null as string|null}));
   const previous=await this.previousOffers(c,plans.map(p=>p.groupId));
   for(const plan of plans)plan.previousOfferId=previous.find(p=>p.groupId===plan.groupId)?.offerId??null;
   const issued=plans.filter(p=>p.state==='OFFER_ISSUED').map(p=>p.groupId);
   if(issued.length){
    const bookings=(await c.query(`SELECT DISTINCT ON (r.group_id) r.group_id,o.id,o.state,o.cleanup,
     os.snapshot->'candidate'->>'activity' AS activity,os.snapshot->'candidate'->>'startAt' AS start_at,os.snapshot->'candidate'->>'timezone' AS timezone,os.snapshot->'candidate'->>'amountMinor' AS amount,os.snapshot->>'deadline' AS deadline
     FROM merchant_requests r JOIN offers o ON o.id=r.approved_offer_id JOIN offer_snapshots os ON os.offer_id=o.id
     WHERE r.group_id=ANY($1::uuid[]) AND r.state='APPROVED' ORDER BY r.group_id,r.planning_revision DESC`,[issued])).rows;
    for(const plan of plans){const booking=bookings.find(b=>b.group_id===plan.groupId);if(booking)Object.assign(plan,{activity:booking.activity,startAt:booking.start_at,timezone:booking.timezone,deadline:booking.deadline,amountMinor:Number(booking.amount),bookingState:booking.state,bookingCleanup:booking.cleanup,offerId:booking.id});}
   }
   const requestsByGroup=new Map<string,CollectionRequest[]>();
   const editable=plans.filter(p=>['COLLECTING','CLOSED','MERCHANT_REVIEW'].includes(p.state)).map(p=>p.groupId);
   if(editable.length){
    // Reuse the disclosure boundary from the group view. Only the action code
    // enters the index; the next-step title may name a requester only to their
    // already-consenting nominee. Private requirements never enter the list.
    const requests=await this.collectionRows(c,actor,editable);
    for(const plan of plans){
     const ownRequests=requests.filter(r=>r.groupId===plan.groupId);requestsByGroup.set(plan.groupId,ownRequests);
     const actions=ownRequests.map(r=>r.role==='OWNER'?(r.revoked?'CHOOSE_COLLECTOR':!r.ownerAgreed?'ASK_COLLECTOR':null):!r.revoked&&!r.nomineeAgreed?'REVIEW_REQUEST':null);
     plan.collectionNextStep=(['CHOOSE_COLLECTOR','REVIEW_REQUEST','ASK_COLLECTOR'] as const).find(action=>actions.includes(action))??null;
    }
   }
   const reviewed=plans.filter(p=>p.studioDeclined||p.studioReviewNeedsRefresh||p.state==='MERCHANT_REVIEW').map(p=>p.groupId);
   if(reviewed.length){const answers=await this.studioAnswers(c,reviewed);for(const plan of plans){const answer=answers.find(a=>a.groupId===plan.groupId);plan.studioDeclined=Boolean(answer?.decline);plan.studioReviewNeedsRefresh=plan.state==='CLOSED'&&answer?.state==='PENDING';if(plan.state==='MERCHANT_REVIEW'&&answer?.session)Object.assign(plan,{activity:answer.session.activity,startAt:answer.session.startAt,timezone:answer.session.timezone});}}
   for(const plan of plans){
    const cat=catalogSchema.parse(plan._catalog),pref=plan._preference?preferenceSchema.parse(plan._preference):null,requests=requestsByGroup.get(plan.groupId)??[];
    const progress=await this.memberProgress(c,plan.groupId,plan.state==='COLLECTING'),withdrawal=await withdrawalForGroup(c,plan.groupId);
    plan.readyCount=progress.filter(m=>!m.excluded&&m.stepStatus==='READY').length;
    const draftsPresent=(await c.query("SELECT to_regclass('intake_message_drafts') IS NOT NULL AS present")).rows[0].present;
    const draftPending=draftsPresent&&!plan.excluded&&Boolean((await c.query("SELECT 1 FROM intake_message_drafts WHERE member_id=$1 AND source_preference_id IS NOT DISTINCT FROM $2 AND expires_at>clock_timestamp() AND status IN ('RESERVED','DISPATCHED','READY','REVIEW') LIMIT 1",[plan._member_id,pref?.revisionId??null])).rowCount);
    const owner=requests.find(r=>r.role==='OWNER'),ask=pref?.collection==='NOMINEE_LATER'&&(!owner||owner.revoked||!owner.ownerAgreed);
    plan.nextStep=nextStep({state:plan.state,excluded:plan.excluded,isOrganizer:plan.isOrganizer,ownReady:plan.ownReady,noteNeedsReview:plan.ownNoteNeedsReview,
     pickupRequesterName:requests.find(r=>r.role==='NOMINEE'&&!r.revoked&&!r.nomineeAgreed)?.ownerName,pickupAnswer:requests.some(r=>r.role==='NOMINEE'&&!r.revoked&&!r.nomineeAgreed),pickupAsk:Boolean(ask),pickupWaiting:Boolean(owner&&!owner.revoked&&owner.ownerAgreed&&!owner.nomineeAgreed),
     ownChoicesNeedReview:Boolean(pref&&privateFeedback(cat,{...pref,extraRequirement:'NONE'},plan.targetSize,false)),draftPending,participationNeedsConfirmation:Boolean(withdrawal&&withdrawal.memberId===plan._member_id&&withdrawal.coming!==true),memberCount:plan.members.length,readyCount:plan.readyCount,allowedSizes:publishedGroupSizes(cat),
     candidateState:plan._candidate_state,studioDeclined:plan.studioDeclined,studioReviewNeedsRefresh:plan.studioReviewNeedsRefresh,offerId:plan.offerId,bookingState:plan.bookingState});
   }
   return {plans:plans.map(({_catalog,_preference,_candidate_state,_member_id,...p})=>{return p.excluded?{...p,members:p.members.filter(m=>m.isYou),readyCount:0,ownReady:false,ownNoteNeedsReview:false,collectionNextStep:null,activity:null,startAt:null,timezone:null,deadline:null,amountMinor:null,bookingState:null,bookingCleanup:null,offerId:null,previousOfferId:null}:p;}),nextCursor:rows.length>20?plans.at(-1)!.groupId:null};
  });
 }
 private async previousOffers(c:pg.PoolClient,groupIds:string[]):Promise<{groupId:string;offerId:string}[]>{
  if(!groupIds.length)return [];
  const restarted=(await c.query("SELECT DISTINCT group_id FROM planning_events WHERE group_id=ANY($1::uuid[]) AND kind='PLANNING_REOPENED'",[groupIds])).rows.map(r=>r.group_id);
  if(!restarted.length)return [];
  // The reopening event establishes which offer is historical. A current
  // cancellation alone must not tell friends that another round has started.
  return (await c.query(`SELECT DISTINCT ON (r.group_id) r.group_id AS "groupId",r.approved_offer_id AS "offerId"
   FROM merchant_requests r JOIN (SELECT group_id,max(revision) AS revision FROM planning_events
    WHERE group_id=ANY($1::uuid[]) AND kind='PLANNING_REOPENED' GROUP BY group_id) reopened ON reopened.group_id=r.group_id
   WHERE r.state='APPROVED' AND r.approved_offer_id IS NOT NULL AND r.planning_revision<reopened.revision
   ORDER BY r.group_id,r.planning_revision DESC`,[restarted])).rows;
 }
 private async studioAnswers(c:pg.Pool|pg.PoolClient,groupIds:string[]):Promise<{groupId:string;state:string;decline:StudioDecline|null;session:RequestedSession|null}[]>{
  // A friend edit does not erase the studio's answer. Only the latest request
  // counts, and its public session facts come from the frozen catalog version.
  const rows=(await c.query(`SELECT DISTINCT ON (r.group_id) r.group_id AS "groupId",r.state,to_jsonb(r)->>'decline_reason' AS reason,
   r.catalog_version_id AS "catalogVersionId",r.offering_id AS "offeringId",r.slot_id AS "slotId",v.catalog
   FROM merchant_requests r JOIN merchant_catalog_versions v ON v.studio_id=r.studio_id AND v.version_id=r.catalog_version_id
   WHERE r.group_id=ANY($1::uuid[]) ORDER BY r.group_id,r.planning_revision DESC`,[groupIds])).rows;
  return rows.map(({groupId,state,catalog:value,...answer})=>{
   const catalog=catalogSchema.parse(value),offering=catalog.offerings.find(o=>o.id===answer.offeringId),slot=catalog.slots.find(s=>s.id===answer.slotId);
   if(!offering||!slot)throw new IntakeError('INVALID_CATALOG');
   return {groupId,state,decline:state==='DECLINED'?{...answer,activity:offering.name,startAt:slot.startAt,timezone:catalog.timezone}:null,session:state==='PENDING'?{activity:offering.name,startAt:slot.startAt,timezone:catalog.timezone,amountMinor:offering.priceMinor}:null};
  });
 }
 async closeRoster(actor:IntakeActor,value:unknown){const p=closeSchema.parse(value);return this.recordCommand(actor,p.commandId,{kind:'CLOSE',...p},async c=>{
  const g=await this.group(c,p.groupId,actor);if(g.organizer_id!==actor.userId)throw new IntakeError('NOT_FOUND');
  if(g.state!=='COLLECTING')throw new IntakeError('ROSTER_CLOSED');if(g.revision!==p.expectedRevision)throw new IntakeError('STALE_REVISION');
  const selected=(await c.query("SELECT id,user_id,current_preference_id FROM planning_members m WHERE group_id=$1 AND id=ANY($2::uuid[]) AND NOT coalesce((to_jsonb(m)->>'excluded')::boolean,false)",[g.id,p.memberIds])).rows;
  if(new Set(p.memberIds).size!==p.memberIds.length||selected.length!==p.memberIds.length||!selected.some(m=>m.user_id===actor.userId)||selected.some(m=>!m.current_preference_id))throw new IntakeError('INVALID_ROSTER');
  if(!publishedGroupSizes(catalogSchema.parse(g.catalog)).includes(selected.length))throw new IntakeError('INVALID_ROSTER');
  await c.query('UPDATE planning_members SET admitted=(id=ANY($2::uuid[])) WHERE group_id=$1',[g.id,p.memberIds]);
  await c.query("UPDATE planning_groups SET state='CLOSED',target_size=$2 WHERE id=$1",[g.id,selected.length]);return {revision:await this.changed(c,g.id,'ROSTER_CLOSED')};
 });}
 async collectionConsent(actor:IntakeActor,value:unknown){const p=consentCommandSchema.parse(value);return this.recordCommand(actor,p.commandId,{kind:'CONSENT',...p},async c=>{
  const g=await this.group(c,p.groupId,actor);
  const caller=(await c.query("SELECT id,admitted FROM planning_members m WHERE group_id=$1 AND user_id=$2 AND NOT coalesce((to_jsonb(m)->>'excluded')::boolean,false)",[g.id,actor.userId])).rows[0];
  if(!caller||(g.state!=='COLLECTING'&&!caller.admitted))throw new IntakeError('NOT_FOUND');
  const owner=(await c.query("SELECT m.id,p.confirmed FROM planning_members m JOIN preference_revisions p ON p.id=m.current_preference_id WHERE m.group_id=$1 AND ($3 OR m.admitted) AND p.id=$2 AND NOT coalesce((to_jsonb(m)->>'excluded')::boolean,false)",[g.id,p.preferenceId,g.state==='COLLECTING'])).rows[0];
  if(!owner)throw new IntakeError('STALE_PREFERENCE');
  const pref=preferenceSchema.parse(owner.confirmed);
  if(pref.collection!=='NOMINEE_LATER'||!pref.nomineeMemberId)throw new IntakeError('NO_COLLECTION_ARRANGEMENT');
  const nominee=(await c.query("SELECT id FROM planning_members n WHERE group_id=$1 AND id=$2 AND ($3 OR admitted) AND NOT coalesce((to_jsonb(n)->>'excluded')::boolean,false)",[g.id,pref.nomineeMemberId,g.state==='COLLECTING'])).rows[0];
  if(!nominee||![owner.id,nominee.id].includes(caller.id))throw new IntakeError('NOT_FOUND');
  if(!['COLLECTING','CLOSED','MERCHANT_REVIEW'].includes(g.state))throw new IntakeError('COLLECTION_REVIEW_REQUIRED');
  if(g.revision!==p.expectedRevision)throw new IntakeError('STALE_REVISION');
  await c.query('INSERT INTO collection_consents(preference_id,owner_member_id,nominee_member_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[p.preferenceId,owner.id,nominee.id]);
  const consent=(await c.query('SELECT * FROM collection_consents WHERE preference_id=$1 FOR UPDATE',[p.preferenceId])).rows[0];
  if(p.action==='REVOKE')await c.query('UPDATE collection_consents SET revoked=true WHERE preference_id=$1',[p.preferenceId]);
  else {
   if(consent.revoked)throw new IntakeError('CONSENT_REVOKED');
   if(!p.disclosureAgreed)throw new IntakeError('DISCLOSURE_REQUIRED');
   if(p.action==='OWNER_AGREE'){
    if(caller.id!==owner.id)throw new IntakeError('NOT_FOUND');
    await c.query('UPDATE collection_consents SET owner_agreed=true,disclosure_agreed=true WHERE preference_id=$1',[p.preferenceId]);
   }else{
    if(caller.id!==nominee.id)throw new IntakeError('NOT_FOUND');
    if(!consent.owner_agreed||!consent.disclosure_agreed)throw new IntakeError('OWNER_CONSENT_REQUIRED');
    await c.query('UPDATE collection_consents SET nominee_agreed=true WHERE preference_id=$1',[p.preferenceId]);
   }
  }
  await c.query('INSERT INTO collection_consent_events(preference_id,actor_member_id,action) VALUES($1,$2,$3)',[p.preferenceId,caller.id,p.action]);
  return {revision:await this.changed(c,g.id,'COLLECTION_CONSENT_CHANGED')};
 });}
 async collectionRequests(actor:IntakeActor,groupId:string){this.actor(actor);uuid.parse(groupId);
  const group=(await this.pool.query('SELECT * FROM planning_groups WHERE id=$1',[groupId])).rows[0];if(!group)throw new IntakeError('NOT_FOUND');assertWorkspaceScope(actor,group);
  return this.collectionProjection(this.pool,actor,groupId);
 }
 private async collectionProjection(c:pg.Pool|pg.PoolClient,actor:IntakeActor,groupId:string):Promise<CollectionRequest[]>{
  return (await this.collectionRows(c,actor,[groupId])).map(({groupId:_,...request})=>request);
 }
 private async collectionRows(c:pg.Pool|pg.PoolClient,actor:IntakeActor,groupIds:string[]):Promise<(CollectionRequest&{groupId:string})[]>{
  // Only an explicitly consenting owner can disclose a collection request to its
  // nominee. Names are never accompanied by private text, ceilings or constraints.
  const rows=(await c.query(`SELECT o.group_id AS "groupId",p.id AS "preferenceId",o.display_name AS "ownerName",
    n.display_name AS "nomineeName",coalesce(cs.owner_agreed,false) AS "ownerAgreed",coalesce(cs.nominee_agreed,false) AS "nomineeAgreed",coalesce(cs.revoked,false) AS revoked,
    CASE WHEN o.user_id=$2 THEN 'OWNER' ELSE 'NOMINEE' END AS role,
    coalesce(cs.revoked AND (SELECT e.actor_member_id=n.id AND e.action='REVOKE' FROM collection_consent_events e WHERE e.preference_id=p.id ORDER BY e.id DESC LIMIT 1),false) AS declined,
    EXISTS(SELECT 1 FROM collection_consents earlier WHERE earlier.owner_member_id=o.id AND earlier.nominee_member_id=n.id AND earlier.preference_id<>p.id AND earlier.nominee_agreed) AS renewed
    FROM planning_members o JOIN preference_revisions p ON o.current_preference_id=p.id
    JOIN planning_members n ON n.id=(p.confirmed->>'nomineeMemberId')::uuid AND n.group_id=o.group_id
    LEFT JOIN collection_consents cs ON cs.preference_id=p.id AND cs.owner_member_id=o.id AND cs.nominee_member_id=n.id
    JOIN planning_groups g ON g.id=o.group_id
    WHERE o.group_id=ANY($1::uuid[]) AND (g.state='COLLECTING' OR o.admitted AND n.admitted OR cs.revoked AND (o.user_id=$2 OR n.user_id=$2))
    AND (NOT coalesce((to_jsonb(o)->>'excluded')::boolean,false) OR cs.revoked AND n.user_id=$2 AND cs.owner_agreed AND cs.disclosure_agreed)
    AND (o.user_id=$2 OR NOT coalesce((to_jsonb(n)->>'excluded')::boolean,false)) AND p.confirmed->>'collection'='NOMINEE_LATER'
    AND (o.user_id=$2 OR (n.user_id=$2 AND cs.owner_agreed AND cs.disclosure_agreed)) ORDER BY p.id`,[groupIds,actor.userId])).rows;
  const changed=(await c.query(`SELECT DISTINCT ON (cs.owner_member_id) o.group_id AS "groupId",cs.preference_id AS "preferenceId",o.display_name AS "ownerName",n.display_name AS "nomineeName",
   true AS "ownerAgreed",true AS "nomineeAgreed",true AS revoked,'NOMINEE' AS role,true AS "detailsChanged"
   FROM collection_consents cs JOIN planning_members o ON o.id=cs.owner_member_id
   JOIN planning_members n ON n.id=cs.nominee_member_id JOIN planning_groups g ON g.id=o.group_id
   JOIN preference_revisions old ON old.id=cs.preference_id
   WHERE o.group_id=ANY($1::uuid[]) AND n.user_id=$2 AND cs.owner_agreed AND cs.disclosure_agreed AND cs.nominee_agreed AND NOT cs.revoked
    AND NOT coalesce((to_jsonb(o)->>'excluded')::boolean,false) AND NOT coalesce((to_jsonb(n)->>'excluded')::boolean,false)
    AND g.state IN ('COLLECTING','CLOSED','MERCHANT_REVIEW') AND (g.state='COLLECTING' OR o.admitted AND n.admitted) AND o.current_preference_id<>cs.preference_id
    AND NOT EXISTS(SELECT 1 FROM collection_consents cur WHERE cur.preference_id=o.current_preference_id AND cur.nominee_member_id=n.id AND cur.owner_agreed AND cur.disclosure_agreed)
   ORDER BY cs.owner_member_id,old.created_at DESC,cs.preference_id DESC`,[groupIds,actor.userId])).rows;
  return [...rows,...changed];
 }
 async plan(actor:IntakeActor,groupId:string){this.actor(actor);uuid.parse(groupId);return transaction(this.pool,async c=>{
  const g=await this.group(c,groupId,actor);const member=(await c.query('SELECT admitted FROM planning_members WHERE group_id=$1 AND user_id=$2',[groupId,actor.userId])).rows[0];
  if(!member?.admitted)throw new IntakeError('NOT_FOUND');if(g.state!=='CLOSED')throw new IntakeError('PLANNING_LOCKED');
  const {result}=await confirmedPlan(c,groupId,g.catalog);
  await c.query('UPDATE planning_groups SET candidate=$2 WHERE id=$1',[groupId,JSON.stringify(result)]);
  return {revision:g.revision,result};
 });}
}
