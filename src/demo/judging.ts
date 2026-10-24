import {createHash,randomBytes,randomUUID} from 'node:crypto';
import type pg from 'pg';
import {z} from 'zod';
import {transaction} from '../db.ts';
import {catalogSchema,preferenceSchema,type Catalog} from '../planning/domain.ts';
import {fingerprint} from '../payments/types.ts';
import {demoRoles,type DemoRole} from './roles.ts';
import {preparedRoles,preparedDemoPreference} from './provision.ts';

export const judgingAccessEnd='2026-12-16T00:00:00Z';
export function judgingCatalog(value:unknown){
 const fixture=catalogSchema.parse(value);
 if(!fixture.synthetic||fixture.versionId!=='willow-synthetic-v1'||fixture.slots.length!==2||fixture.slots[0].id!=='thu-evening'||fixture.slots[1].id!=='fri-evening')throw new Error('JUDGING_FIXTURE_REQUIRED');
 return catalogSchema.parse({...fixture,versionId:'willow-synthetic-judging-v1',slots:[
  {id:'thu-evening',startAt:'2027-01-15T01:15:00Z'},
  {id:'fri-evening',startAt:'2027-01-16T01:00:00Z'}
 ]});
}
type ReleaseResult={workspaceId:string;status:'RELEASED'|'ALREADY_RELEASED'|'LEASE_PRESERVED';groupId:string;catalogVersion:string};

// Offline only: an untouched fixture can receive a new planning group/catalog.
// No Auth account, consent, reservation, offer or provider operation is created.
export class JudgingPreparation {
 constructor(private pool:pg.Pool,private original:Catalog,private replacement:Catalog){
  catalogSchema.parse(original);catalogSchema.parse(replacement);
  if(!original.synthetic||!replacement.synthetic||original.versionId===replacement.versionId)throw new Error('NEW_SYNTHETIC_CATALOG_REQUIRED');
  if(replacement.slots.length===0||replacement.slots.some(s=>Date.parse(s.startAt)<=Date.parse(judgingAccessEnd)+26.5*3600000))throw new Error('JUDGING_SESSION_TOO_EARLY');
 }
 private async prepare(c:pg.PoolClient,id:string,apply:boolean):Promise<ReleaseResult>{
  const w=(await c.query('SELECT * FROM demo_workspaces WHERE id=$1 FOR UPDATE',[id])).rows[0];
  if(!w)throw new Error('JUDGING_WORKSPACE_NOT_FOUND');
  if(w.state==='LEASED')return {workspaceId:id,status:'LEASE_PRESERVED',groupId:w.group_id,catalogVersion:w.catalog.versionId};
  if(w.state!=='AVAILABLE'||w.lease_id||w.active_user_id)throw new Error('UNCLAIMED_WORKSPACE_REQUIRED');
  const g=(await c.query('SELECT * FROM planning_groups WHERE id=$1 FOR UPDATE',[w.group_id])).rows[0];
  if(!g||g.demo_workspace_id!==id||fingerprint(g.catalog)!==fingerprint(w.catalog))throw new Error('JUDGING_GROUP_CHECKPOINT_MISMATCH');
  const original=catalogSchema.parse({...this.original,studioId:`demo-${id}`,versionId:`demo-catalog-${id}`});
  const replacement=catalogSchema.parse({...this.replacement,studioId:`demo-${id}`,versionId:`${this.replacement.versionId}-${id}`});
  if(fingerprint(w.catalog)===fingerprint(replacement))return {workspaceId:id,status:'ALREADY_RELEASED',groupId:g.id,catalogVersion:replacement.versionId};
  if(fingerprint(w.catalog)!==fingerprint(original)||w.studio_id!==original.studioId||g.state!=='COLLECTING'||g.revision!==9||g.target_size!==6||g.candidate)throw new Error('UNTOUCHED_FIXTURE_REQUIRED');
  const identities=(await c.query('SELECT role,user_id,email,display_name FROM demo_identities WHERE workspace_id=$1 ORDER BY role',[id])).rows;
  if(identities.length!==7||identities.some(d=>!Object.hasOwn(demoRoles,d.role)||d.display_name!==demoRoles[d.role as DemoRole]||d.email!==`${d.role.toLowerCase()}.${id}@rally-demo.invalid`)||identities.find(d=>d.role==='ORGANIZER')?.user_id!==g.organizer_id)throw new Error('JUDGING_IDENTITIES_MISMATCH');
  const members=(await c.query(`SELECT m.*,d.role,p.confirmed,p.optional_text,p.wording_bound FROM planning_members m
   JOIN demo_identities d ON d.user_id=m.user_id AND d.workspace_id=$2
   LEFT JOIN preference_revisions p ON p.id=m.current_preference_id WHERE m.group_id=$1`,[g.id,id])).rows;
  if(members.length!==6||members.some(m=>m.role==='STUDIO'||m.admitted||m.ai_calls!==0||m.ai_questions!==0||m.display_name!==demoRoles[m.role as DemoRole]))throw new Error('UNTOUCHED_FIXTURE_REQUIRED');
  for(const m of members){
   const index=preparedRoles.indexOf(m.role);
   if(index<0){if(m.current_preference_id)throw new Error('UNTOUCHED_FIXTURE_REQUIRED');}
   else if(!m.current_preference_id||m.optional_text!==null||m.wording_bound!==null||fingerprint(m.confirmed)!==fingerprint({...preparedDemoPreference(index),memberId:m.id,revisionId:m.current_preference_id}))throw new Error('UNTOUCHED_FIXTURE_REQUIRED');
  }
  const counts=(await c.query(`SELECT
   (SELECT count(*) FROM preference_revisions p JOIN planning_members m ON m.id=p.member_id WHERE m.group_id=$1)::int AS preferences,
   (SELECT count(*) FROM planning_clarifications q JOIN planning_members m ON m.id=q.member_id WHERE m.group_id=$1)::int AS clarifications,
   (SELECT count(*) FROM collection_consents s JOIN planning_members m ON m.id=s.owner_member_id WHERE m.group_id=$1)::int AS consents,
   (SELECT count(*) FROM merchant_requests WHERE group_id=$1)::int AS requests`,[g.id])).rows[0];
  if(counts.preferences!==4||counts.clarifications!==0||counts.consents!==0||counts.requests!==0)throw new Error('UNTOUCHED_FIXTURE_REQUIRED');
  const studio=(await c.query('SELECT owner_user_id FROM merchant_studios WHERE studio_id=$1',[original.studioId])).rows[0];
  const published=(await c.query('SELECT catalog FROM merchant_catalog_versions WHERE studio_id=$1 AND version_id=$2',[original.studioId,original.versionId])).rows[0];
  if(studio?.owner_user_id!==identities.find(d=>d.role==='STUDIO')?.user_id||!published||fingerprint(published.catalog)!==fingerprint(original))throw new Error('JUDGING_STUDIO_CHECKPOINT_MISMATCH');
  if(!apply)return {workspaceId:id,status:'RELEASED',groupId:g.id,catalogVersion:replacement.versionId};
  await c.query('INSERT INTO merchant_catalog_versions(studio_id,version_id,catalog) VALUES($1,$2,$3) ON CONFLICT(studio_id,version_id) DO NOTHING',[replacement.studioId,replacement.versionId,JSON.stringify(replacement)]);
  const nextPublished=(await c.query('SELECT catalog FROM merchant_catalog_versions WHERE studio_id=$1 AND version_id=$2',[replacement.studioId,replacement.versionId])).rows[0];
  if(fingerprint(nextPublished.catalog)!==fingerprint(replacement))throw new Error('JUDGING_PUBLISHED_CATALOG_MISMATCH');
  const groupId=randomUUID(),invite=randomBytes(32).toString('hex'),commandId=randomUUID();
  await c.query('INSERT INTO planning_groups(id,organizer_id,invite_digest,target_size,catalog,revision,demo_workspace_id) VALUES($1,$2,$3,6,$4,1,$5)',[groupId,g.organizer_id,createHash('sha256').update(invite).digest('hex'),JSON.stringify(replacement),id]);
  // Keep the organizer's invite available without rewriting any prior command.
  await c.query('INSERT INTO intake_commands VALUES($1,$2,$3,$4)',[commandId,g.organizer_id,fingerprint({kind:'OFFLINE_JUDGING_FIXTURE',workspaceId:id,catalog:replacement}),JSON.stringify({groupId,invite,revision:1})]);
  for(const d of identities.filter(d=>d.role!=='STUDIO')){
   const memberId=randomUUID();await c.query('INSERT INTO planning_members(id,group_id,user_id,display_name) VALUES($1,$2,$3,$4)',[memberId,groupId,d.user_id,d.display_name]);
   const index=preparedRoles.indexOf(d.role);
   if(index>=0){const preferenceId=randomUUID(),preference=preferenceSchema.parse({...preparedDemoPreference(index),memberId,revisionId:preferenceId});
    await c.query('INSERT INTO preference_revisions(id,member_id,confirmed) VALUES($1,$2,$3)',[preferenceId,memberId,JSON.stringify(preference)]);
    await c.query('UPDATE planning_members SET current_preference_id=$2 WHERE id=$1',[memberId,preferenceId]);
   }
  }
  await c.query("INSERT INTO planning_events(group_id,revision,kind) VALUES($1,1,'DEMO_FIXTURE_PREPARED')",[groupId]);
  await c.query("UPDATE planning_groups SET state='ABANDONED',revision=revision+1 WHERE id=$1",[g.id]);
  await c.query("INSERT INTO planning_events(group_id,revision,kind) VALUES($1,$2,'DEMO_CATALOG_REPLACED')",[g.id,g.revision+1]);
  await c.query('UPDATE demo_workspaces SET catalog=$2,group_id=$3 WHERE id=$1',[id,JSON.stringify(replacement),groupId]);
  return {workspaceId:id,status:'RELEASED',groupId,catalogVersion:replacement.versionId};
 }
 async run(workspaceIds:string[],apply=false){
  z.array(z.uuid()).min(1).max(25).refine(ids=>new Set(ids).size===ids.length).parse(workspaceIds);
  // One transaction covers the selected workspace release. A rejected fixture
  // rolls back all changes, including newly published versions and groups.
  return transaction(this.pool,async c=>{const results=[];for(const id of [...workspaceIds].sort())results.push(await this.prepare(c,id,apply));return results;});
 }
}
