import { randomUUID,randomBytes,createHash } from 'node:crypto';
import type pg from 'pg';
import { z } from 'zod';
import { transaction } from '../db.ts';
import { fingerprint } from '../payments/types.ts';
import { catalogSchema,preferenceSchema,planGroup } from '../planning/domain.ts';

// Only server-authenticated identity may construct this input. Request bodies must
// never supply actorId/verified. Managed Auth route binding remains a separate gate.
export interface IntakeActor {userId:string;emailVerified:boolean}
export class IntakeError extends Error {constructor(public code:string){super(code);}}
const uuid=z.uuid(),name=z.string().trim().min(1).max(60);
const createSchema=z.strictObject({commandId:uuid,targetSize:z.number().int().min(1).max(8),displayName:name,catalog:catalogSchema});
const joinSchema=z.strictObject({commandId:uuid,invite:z.string().regex(/^[a-f0-9]{64}$/),displayName:name});
const saveSchema=z.strictObject({commandId:uuid,groupId:uuid,expectedRevision:z.number().int().nonnegative(),expectedPreferenceId:uuid.nullable(),
 preference:preferenceSchema.omit({memberId:true,revisionId:true}),optionalText:z.string().max(2000).nullable()});
const closeSchema=z.strictObject({commandId:uuid,groupId:uuid,expectedRevision:z.number().int().nonnegative(),memberIds:z.array(uuid).min(1).max(8)});
const consentCommandSchema=z.strictObject({commandId:uuid,groupId:uuid,expectedRevision:z.number().int().nonnegative(),preferenceId:uuid,action:z.enum(['OWNER_AGREE','NOMINEE_AGREE','REVOKE']),disclosureAgreed:z.boolean()});
const digest=(s:string)=>createHash('sha256').update(s).digest('hex');
export class IntakeService {
 constructor(private pool:pg.Pool){}
 private actor(a:IntakeActor){uuid.parse(a.userId);if(a.emailVerified!==true)throw new IntakeError('VERIFIED_IDENTITY_REQUIRED');}
 private async command<T>(actor:IntakeActor,id:string,payload:unknown,fn:(c:pg.PoolClient)=>Promise<T>):Promise<T>{
  this.actor(actor);const hash=fingerprint(payload);
  return transaction(this.pool,async c=>{
   // Global command lock makes lost-response retries single-effect, including creation.
   await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[id]);
   const prior=(await c.query('SELECT actor_id,fingerprint,result FROM intake_commands WHERE id=$1',[id])).rows[0];
   if(prior){if(prior.actor_id!==actor.userId||prior.fingerprint!==hash)throw new IntakeError('COMMAND_CONFLICT');return prior.result as T;}
   const result=await fn(c);
   await c.query('INSERT INTO intake_commands VALUES($1,$2,$3,$4)',[id,actor.userId,hash,JSON.stringify(result)]);return result;
  });
 }
 private async group(c:pg.PoolClient,id:string){const row=(await c.query('SELECT * FROM planning_groups WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!row)throw new IntakeError('NOT_FOUND');return row;}
 private async changed(c:pg.PoolClient,id:string,kind:string){
  const row=(await c.query('UPDATE planning_groups SET revision=revision+1,candidate=NULL WHERE id=$1 RETURNING revision',[id])).rows[0];
  await c.query('INSERT INTO planning_events(group_id,revision,kind) VALUES($1,$2,$3)',[id,row.revision,kind]);return row.revision as number;
 }
 async create(actor:IntakeActor,value:unknown){const p=createSchema.parse(value);return this.command(actor,p.commandId,{kind:'CREATE',...p},async c=>{
  const groupId=randomUUID(),memberId=randomUUID(),invite=randomBytes(32).toString('hex');
  await c.query('INSERT INTO planning_groups(id,organizer_id,invite_digest,target_size,catalog) VALUES($1,$2,$3,$4,$5)',[groupId,actor.userId,digest(invite),p.targetSize,JSON.stringify(p.catalog)]);
  await c.query('INSERT INTO planning_members(id,group_id,user_id,display_name) VALUES($1,$2,$3,$4)',[memberId,groupId,actor.userId,p.displayName]);
  return {groupId,memberId,invite,revision:0};
 });}
 async join(actor:IntakeActor,value:unknown){const p=joinSchema.parse(value);return this.command(actor,p.commandId,{kind:'JOIN',...p},async c=>{
  const g=(await c.query('SELECT * FROM planning_groups WHERE invite_digest=$1 FOR UPDATE',[digest(p.invite)])).rows[0];
  if(!g)throw new IntakeError('NOT_FOUND');if(g.state!=='COLLECTING')throw new IntakeError('ROSTER_CLOSED');
  const prior=(await c.query('SELECT id FROM planning_members WHERE group_id=$1 AND user_id=$2',[g.id,actor.userId])).rows[0];
  if(prior)return {groupId:g.id,memberId:prior.id,revision:g.revision};
  if(Number((await c.query('SELECT count(*) FROM planning_members WHERE group_id=$1',[g.id])).rows[0].count)>=8)throw new IntakeError('GROUP_FULL');
  const memberId=randomUUID();await c.query('INSERT INTO planning_members(id,group_id,user_id,display_name) VALUES($1,$2,$3,$4)',[memberId,g.id,actor.userId,p.displayName]);
  return {groupId:g.id,memberId,revision:await this.changed(c,g.id,'MEMBER_JOINED')};
 });}
 async save(actor:IntakeActor,value:unknown){const p=saveSchema.parse(value);return this.command(actor,p.commandId,{kind:'SAVE',...p},async c=>{
  const g=await this.group(c,p.groupId);
  const m=(await c.query('SELECT id,current_preference_id,admitted FROM planning_members WHERE group_id=$1 AND user_id=$2',[p.groupId,actor.userId])).rows[0];
  if(!m)throw new IntakeError('NOT_FOUND');
  if(!['COLLECTING','CLOSED'].includes(g.state))throw new IntakeError('PLANNING_LOCKED');
  if(g.state==='CLOSED'&&!m.admitted)throw new IntakeError('NOT_FOUND');
  if(g.revision!==p.expectedRevision||m.current_preference_id!==p.expectedPreferenceId)throw new IntakeError('STALE_REVISION');
  const catalog=catalogSchema.parse(g.catalog);
  if(p.preference.availableSlotIds.some(id=>!catalog.slots.some(s=>s.id===id)))throw new IntakeError('UNKNOWN_SLOT');
  if(p.preference.nomineeMemberId){const nominee=(await c.query('SELECT id FROM planning_members WHERE group_id=$1 AND id=$2',[g.id,p.preference.nomineeMemberId])).rows[0];if(!nominee||nominee.id===m.id)throw new IntakeError('INVALID_NOMINEE');}
  const preferenceId=randomUUID(),confirmed={...p.preference,memberId:m.id,revisionId:preferenceId};
  await c.query('INSERT INTO preference_revisions(id,member_id,confirmed,optional_text) VALUES($1,$2,$3,$4)',[preferenceId,m.id,JSON.stringify(confirmed),p.optionalText]);
  await c.query('UPDATE planning_members SET current_preference_id=$1 WHERE id=$2',[preferenceId,m.id]);
  return {preferenceId,revision:await this.changed(c,g.id,'PREFERENCE_CONFIRMED')};
 });}
 async ownPreferences(actor:IntakeActor,groupId:string){this.actor(actor);uuid.parse(groupId);
  const m=(await this.pool.query('SELECT p.confirmed,p.optional_text FROM planning_members m LEFT JOIN preference_revisions p ON p.id=m.current_preference_id WHERE m.group_id=$1 AND m.user_id=$2',[groupId,actor.userId])).rows[0];
  if(!m)throw new IntakeError('NOT_FOUND');return {preference:m.confirmed,optionalText:m.optional_text};
 }
 async roster(actor:IntakeActor,groupId:string){this.actor(actor);uuid.parse(groupId);
  const g=(await this.pool.query('SELECT organizer_id,revision,state,target_size FROM planning_groups WHERE id=$1',[groupId])).rows[0];if(!g||g.organizer_id!==actor.userId)throw new IntakeError('NOT_FOUND');
  // This is the ONLY organizer intake projection; budgets and text never enter it.
  const members=(await this.pool.query('SELECT id,display_name AS "displayName",admitted,current_preference_id IS NOT NULL AS ready FROM planning_members WHERE group_id=$1 ORDER BY id',[groupId])).rows;
  return {revision:g.revision,state:g.state,targetSize:g.target_size,members};
 }
 async closeRoster(actor:IntakeActor,value:unknown){const p=closeSchema.parse(value);return this.command(actor,p.commandId,{kind:'CLOSE',...p},async c=>{
  const g=await this.group(c,p.groupId);if(g.organizer_id!==actor.userId)throw new IntakeError('NOT_FOUND');
  if(g.state!=='COLLECTING')throw new IntakeError('ROSTER_CLOSED');if(g.revision!==p.expectedRevision)throw new IntakeError('STALE_REVISION');
  const selected=(await c.query('SELECT id,user_id,current_preference_id FROM planning_members WHERE group_id=$1 AND id=ANY($2::uuid[])',[g.id,p.memberIds])).rows;
  if(new Set(p.memberIds).size!==p.memberIds.length||selected.length!==g.target_size||selected.length!==p.memberIds.length||!selected.some(m=>m.user_id===actor.userId)||selected.some(m=>!m.current_preference_id))throw new IntakeError('INVALID_ROSTER');
  await c.query('UPDATE planning_members SET admitted=(id=ANY($2::uuid[])) WHERE group_id=$1',[g.id,p.memberIds]);
  await c.query("UPDATE planning_groups SET state='CLOSED' WHERE id=$1",[g.id]);return {revision:await this.changed(c,g.id,'ROSTER_CLOSED')};
 });}
 async collectionConsent(actor:IntakeActor,value:unknown){const p=consentCommandSchema.parse(value);return this.command(actor,p.commandId,{kind:'CONSENT',...p},async c=>{
  const g=await this.group(c,p.groupId);
  const caller=(await c.query('SELECT id,admitted FROM planning_members WHERE group_id=$1 AND user_id=$2',[g.id,actor.userId])).rows[0];
  if(!caller?.admitted)throw new IntakeError('NOT_FOUND');
  const owner=(await c.query('SELECT m.id,p.confirmed FROM planning_members m JOIN preference_revisions p ON p.id=m.current_preference_id WHERE m.group_id=$1 AND m.admitted AND p.id=$2',[g.id,p.preferenceId])).rows[0];
  if(!owner)throw new IntakeError('STALE_PREFERENCE');
  const pref=preferenceSchema.parse(owner.confirmed);
  if(pref.collection!=='NOMINEE_LATER'||!pref.nomineeMemberId)throw new IntakeError('NO_COLLECTION_ARRANGEMENT');
  const nominee=(await c.query('SELECT id FROM planning_members WHERE group_id=$1 AND id=$2 AND admitted',[g.id,pref.nomineeMemberId])).rows[0];
  if(!nominee||![owner.id,nominee.id].includes(caller.id))throw new IntakeError('NOT_FOUND');
  if(g.state!=='CLOSED')throw new IntakeError('COLLECTION_REVIEW_REQUIRED');
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
  // Only an explicitly consenting owner can disclose a collection request to its
  // nominee. Names are never accompanied by private text, ceilings or constraints.
  const rows=(await this.pool.query(`SELECT p.id AS "preferenceId",o.display_name AS "ownerName",
    n.display_name AS "nomineeName",cs.owner_agreed AS "ownerAgreed",cs.nominee_agreed AS "nomineeAgreed",cs.revoked,
    CASE WHEN o.user_id=$2 THEN 'OWNER' ELSE 'NOMINEE' END AS role
    FROM collection_consents cs JOIN preference_revisions p ON p.id=cs.preference_id
    JOIN planning_members o ON o.id=cs.owner_member_id AND o.current_preference_id=p.id
    JOIN planning_members n ON n.id=cs.nominee_member_id AND n.group_id=o.group_id
    WHERE o.group_id=$1 AND o.admitted AND n.admitted
    AND (o.user_id=$2 OR (n.user_id=$2 AND cs.owner_agreed AND cs.disclosure_agreed)) ORDER BY p.id`,[groupId,actor.userId])).rows;
  return rows;
 }
 async plan(actor:IntakeActor,groupId:string){this.actor(actor);uuid.parse(groupId);return transaction(this.pool,async c=>{
  const g=await this.group(c,groupId);const member=(await c.query('SELECT admitted FROM planning_members WHERE group_id=$1 AND user_id=$2',[groupId,actor.userId])).rows[0];
  if(!member?.admitted)throw new IntakeError('NOT_FOUND');if(g.state!=='CLOSED')throw new IntakeError('PLANNING_LOCKED');
  const rows=(await c.query('SELECT p.confirmed FROM planning_members m JOIN preference_revisions p ON p.id=m.current_preference_id WHERE m.group_id=$1 AND m.admitted ORDER BY m.id',[groupId])).rows;
  const consentRows=(await c.query(`SELECT cs.* FROM collection_consents cs
    JOIN planning_members m ON m.id=cs.owner_member_id AND m.current_preference_id=cs.preference_id
    WHERE m.group_id=$1 AND m.admitted`,[groupId])).rows;
  const consents=consentRows.map(r=>({ownerMemberId:r.owner_member_id,nomineeMemberId:r.nominee_member_id,preferenceRevisionId:r.preference_id,
    ownerAgreed:r.owner_agreed,nomineeAgreed:r.nominee_agreed,disclosureAgreed:r.disclosure_agreed,revoked:r.revoked}));
  const result=planGroup(g.catalog,rows.map(r=>r.confirmed),consents);
  await c.query('UPDATE planning_groups SET candidate=$2 WHERE id=$1',[groupId,JSON.stringify(result)]);
  return {revision:g.revision,result};
 });}
}
