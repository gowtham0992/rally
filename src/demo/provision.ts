import {randomUUID} from 'node:crypto';
import type pg from 'pg';
import {z} from 'zod';
import {transaction} from '../db.ts';
import {IntakeService,type IntakeActor} from '../intake/service.ts';
import {catalogSchema,type Catalog} from '../planning/domain.ts';
import {fingerprint} from '../payments/types.ts';
import {demoPassword} from './access.ts';
import {demoRoles,type DemoRole} from './roles.ts';

// Offline provisioning only. No administrative Auth client belongs in a web route.
export interface DemoAccount {id:string;email?:string;email_confirmed_at?:string;app_metadata:Record<string,unknown>}
export interface DemoAccounts {
 ensure(input:{workspaceId:string;role:DemoRole;email:string;password:string;existingUserId?:string}):Promise<DemoAccount>;
}
export function demoEmail(workspaceId:string,role:DemoRole){
 z.uuid().parse(workspaceId);return `${role.toLowerCase()}.${workspaceId}@rally-demo.invalid`;
}
export function demoMetadata(workspaceId:string,role:DemoRole){return {rally_demo:true,rally_workspace:workspaceId,rally_role:role};}
export function assertDemoAccount(user:DemoAccount,input:{workspaceId:string;role:DemoRole;email:string;existingUserId?:string}){
 z.uuid().parse(user.id);
 if(user.email!==input.email||!user.email_confirmed_at||
  (input.existingUserId&&user.id!==input.existingUserId)||
  user.app_metadata.rally_demo!==true||user.app_metadata.rally_workspace!==input.workspaceId||user.app_metadata.rally_role!==input.role)
  throw new Error('DEMO_ACCOUNT_SCOPE_MISMATCH');
}
const preparedRoles:DemoRole[]=['COLLECTOR','FRIEND_ONE','FRIEND_TWO','FRIEND_THREE'];
export class DemoProvisioner {
 constructor(private pool:pg.Pool,private accounts:DemoAccounts,private key:string,private merchantId:string,private fixture:Catalog){
  if(!/^[a-f0-9]{64}$/.test(key)||!merchantId)throw new Error('DEMO_PROVISION_CONFIG_REQUIRED');
  catalogSchema.parse(fixture);if(!fixture.synthetic)throw new Error('SYNTHETIC_CATALOG_REQUIRED');
 }
 async provision(workspaceId:string){
  z.uuid().parse(workspaceId);
  // A session lock serializes offline resumptions across processes without
  // holding a database transaction over an external Auth request.
  const lock=await this.pool.connect();
  try{
   await lock.query('SELECT pg_advisory_lock(hashtextextended($1,83))',[workspaceId]);
   const catalog=catalogSchema.parse({...this.fixture,studioId:`demo-${workspaceId}`,versionId:`demo-catalog-${workspaceId}`});
   await lock.query('INSERT INTO demo_workspaces(id,studio_id,catalog) VALUES($1,$2,$3) ON CONFLICT(id) DO NOTHING',[workspaceId,catalog.studioId,JSON.stringify(catalog)]);
   const workspace=(await lock.query('SELECT * FROM demo_workspaces WHERE id=$1',[workspaceId])).rows[0];
   if(workspace.studio_id!==catalog.studioId||fingerprint(workspace.catalog)!==fingerprint(catalog))throw new Error('DEMO_CATALOG_CHECKPOINT_MISMATCH');
   if(workspace.state!=='PROVISIONING')return {workspaceId,groupId:workspace.group_id as string,state:workspace.state as 'AVAILABLE'|'LEASED',created:false};
   const actors={} as Record<DemoRole,IntakeActor>;
   for(const role of Object.keys(demoRoles) as DemoRole[]){
    const existing=(await lock.query('SELECT user_id FROM demo_identities WHERE workspace_id=$1 AND role=$2',[workspaceId,role])).rows[0];
    const input={workspaceId,role,email:demoEmail(workspaceId,role),password:demoPassword(this.key,workspaceId,role),existingUserId:existing?.user_id as string|undefined};
    const account=await this.accounts.ensure(input);assertDemoAccount(account,input);
    await lock.query('INSERT INTO demo_identities(workspace_id,role,user_id,email,display_name) VALUES($1,$2,$3,$4,$5) ON CONFLICT(workspace_id,role) DO NOTHING',[workspaceId,role,account.id,input.email,demoRoles[role]]);
    const registered=(await lock.query('SELECT user_id,email,display_name FROM demo_identities WHERE workspace_id=$1 AND role=$2',[workspaceId,role])).rows[0];
    if(registered.user_id!==account.id||registered.email!==input.email||registered.display_name!==demoRoles[role])throw new Error('DEMO_REGISTRY_MISMATCH');
    actors[role]={userId:account.id,emailVerified:true,demoWorkspaceId:workspaceId};
   }
   const intake=new IntakeService(this.pool);
   // The workspace UUID is also the stable create command, so a lost response
   // before recording group_id resumes the same group, never a replacement.
   const group=await intake.create(actors.ORGANIZER,{commandId:workspaceId,targetSize:6,displayName:demoRoles.ORGANIZER,catalog});
   if(workspace.group_id&&workspace.group_id!==group.groupId)throw new Error('DEMO_GROUP_CHECKPOINT_MISMATCH');
   await lock.query('UPDATE demo_workspaces SET group_id=$2 WHERE id=$1',[workspaceId,group.groupId]);
   for(const role of (Object.keys(demoRoles) as DemoRole[]).filter(r=>r!=='ORGANIZER'&&r!=='STUDIO'))
    await intake.join(actors[role],{commandId:actors[role].userId,invite:group.invite,displayName:demoRoles[role]});
   for(const [index,role] of preparedRoles.entries()){
    const context=await intake.participantContext(actors[role],group.groupId);
    if(!context.preference)await intake.save(actors[role],{commandId:randomUUID(),groupId:group.groupId,expectedRevision:context.revision,expectedPreferenceId:null,
     preference:{budgetMinor:6000+index*500,availableSlotIds:['thu-evening'],latestFinishAt:null,technique:'ANY',outcome:'FORM_OWN_CUP',collection:'SELF_LATER',nomineeMemberId:null,extraRequirement:'NONE',unresolvedKeys:[]},optionalText:null});
   }
   await transaction(this.pool,async c=>{
    const resource=`demo-resource-${workspaceId}`;
    await c.query('INSERT INTO merchant_studios VALUES($1,$2,$3,$4,15,20) ON CONFLICT(studio_id) DO NOTHING',[catalog.studioId,actors.STUDIO.userId,this.merchantId,resource]);
    const studio=(await c.query('SELECT * FROM merchant_studios WHERE studio_id=$1',[catalog.studioId])).rows[0];
    if(studio.owner_user_id!==actors.STUDIO.userId||studio.paypal_merchant_id!==this.merchantId||studio.resource_id!==resource||studio.setup_minutes!==15||studio.cleanup_minutes!==20)throw new Error('DEMO_STUDIO_CHECKPOINT_MISMATCH');
    await c.query('INSERT INTO merchant_catalog_versions(studio_id,version_id,catalog) VALUES($1,$2,$3) ON CONFLICT(studio_id,version_id) DO NOTHING',[catalog.studioId,catalog.versionId,JSON.stringify(catalog)]);
    const published=(await c.query('SELECT catalog FROM merchant_catalog_versions WHERE studio_id=$1 AND version_id=$2',[catalog.studioId,catalog.versionId])).rows[0];
    if(fingerprint(published.catalog)!==fingerprint(catalog))throw new Error('DEMO_PUBLISHED_CATALOG_MISMATCH');
    const ready=(await c.query(`SELECT g.state,g.organizer_id,g.demo_workspace_id,
     (SELECT count(*) FROM demo_identities WHERE workspace_id=$1) AS identities,
     (SELECT count(*) FROM planning_members WHERE group_id=g.id) AS members,
     (SELECT count(*) FROM planning_members WHERE group_id=g.id AND current_preference_id IS NOT NULL) AS prepared,
     (SELECT count(*) FROM planning_members WHERE group_id=g.id AND admitted) AS admitted
     FROM planning_groups g WHERE g.id=$2 FOR UPDATE`,[workspaceId,group.groupId])).rows[0];
    if(ready.state!=='COLLECTING'||ready.organizer_id!==actors.ORGANIZER.userId||ready.demo_workspace_id!==workspaceId||Number(ready.identities)!==7||Number(ready.members)!==6||Number(ready.prepared)!==4||Number(ready.admitted)!==0)throw new Error('DEMO_INITIAL_STATE_MISMATCH');
    await c.query("UPDATE demo_workspaces SET state='AVAILABLE' WHERE id=$1 AND state='PROVISIONING'",[workspaceId]);
   });
   return {workspaceId,groupId:group.groupId,state:'AVAILABLE' as const,created:true};
  }finally{try{await lock.query('SELECT pg_advisory_unlock(hashtextextended($1,83))',[workspaceId]);}finally{lock.release();}}
 }
}
