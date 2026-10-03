import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import type pg from 'pg';
import {transaction} from '../db.ts';
import {WebError} from '../web/security.ts';
import {demoRoles,type DemoRole} from './roles.ts';
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
export const maxDemoLeaseSeconds=90*86400;
export type DemoAccessConfig={key:string;code:string;accessEnd?:string};
export function demoConfig(){
 if(process.env.RALLY_DEMO_ENABLED!=='true')throw new WebError('DEMO_UNAVAILABLE',503);
 const key=process.env.RALLY_DEMO_KEY,code=process.env.RALLY_DEMO_ACCESS_CODE;
 if(!key||!/^[a-f0-9]{64}$/.test(key)||!code||code.length<16||code.length>128)throw new WebError('SETUP_REQUIRED',503);
 const accessEnd=process.env.RALLY_DEMO_ACCESS_END||undefined;
 if(accessEnd!==undefined&&!z.iso.datetime().safeParse(accessEnd).success)throw new WebError('SETUP_REQUIRED',503);
 return {key,code,...(accessEnd?{accessEnd}:{})};
}
export function demoPassword(key:string,workspaceId:string,role:DemoRole){
 return 'Rally!'+createHmac('sha256',key).update('demo-password\0').update(workspaceId).update('\0').update(role).digest('base64url');
}
export class DemoAccess {
 constructor(private pool:pg.Pool,private config:DemoAccessConfig){
  if(config.accessEnd!==undefined&&!z.iso.datetime().safeParse(config.accessEnd).success)throw new WebError('SETUP_REQUIRED',503);
 }
 private token(id:string,workspaceId:string){return createHmac('sha256',this.config.key).update('demo-lease\0').update(id).update('\0').update(workspaceId).digest('hex');}
 async claim(commandId:string,code:string){
  z.uuid().parse(commandId);if(typeof code!=='string'||code.length>128||!timingSafeEqual(Buffer.from(hash(code),'hex'),Buffer.from(hash(this.config.code),'hex')))throw new WebError('DEMO_CODE_REQUIRED',403);
  return transaction(this.pool,async c=>{
   await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,82))',[commandId]);
   let row=(await c.query('SELECT *,expires_at>clock_timestamp() AS active FROM demo_workspaces WHERE lease_id=$1 FOR UPDATE',[commandId])).rows[0];
   if(!row){
    // Trusted deployment policy affects new leases only. Database time sets
    // the boundary; retries never renew an existing or expired session.
    if(this.config.accessEnd){
     const window=(await c.query('SELECT $1::timestamptz>clock_timestamp() AND $1::timestamptz<=clock_timestamp()+interval \'90 days\' AS valid',[this.config.accessEnd])).rows[0];
     if(!window.valid)throw new WebError('DEMO_UNAVAILABLE',503);
    }
    row=(await c.query(`SELECT w.* FROM demo_workspaces w JOIN planning_groups g ON g.id=w.group_id
     WHERE w.state='AVAILABLE' AND g.demo_workspace_id=w.id
     AND (SELECT count(*) FROM demo_identities d WHERE d.workspace_id=w.id)=7
     AND EXISTS(SELECT 1 FROM demo_identities d WHERE d.workspace_id=w.id AND d.role='ORGANIZER' AND d.user_id=g.organizer_id)
     ORDER BY w.id LIMIT 1 FOR UPDATE OF w SKIP LOCKED`)).rows[0];
    if(!row)throw new WebError('DEMO_FULL',503);
    const token=this.token(commandId,row.id);
    row=(await c.query("UPDATE demo_workspaces SET state='LEASED',lease_id=$2,lease_digest=$3,active_user_id=(SELECT user_id FROM demo_identities WHERE workspace_id=$1 AND role='ORGANIZER'),leased_at=clock_timestamp(),expires_at=coalesce($4::timestamptz,clock_timestamp()+interval '24 hours') WHERE id=$1 RETURNING *",[row.id,commandId,hash(token),this.config.accessEnd??null])).rows[0];row.active=true;
   }
   const token=this.token(commandId,row.id);
   if(!row.active||row.lease_digest!==hash(token))throw new WebError('DEMO_SESSION_EXPIRED',401);
   return {token,workspaceId:row.id as string,groupId:row.group_id as string,expiresAt:row.expires_at.toISOString() as string};
  });
 }
 async workspace(token:string){
  if(!/^[a-f0-9]{64}$/.test(token))throw new WebError('DEMO_SESSION_EXPIRED',401);
  const row=(await this.pool.query("SELECT id,group_id,catalog,expires_at,active_user_id FROM demo_workspaces WHERE lease_digest=$1 AND state='LEASED' AND expires_at>clock_timestamp()",[hash(token)])).rows[0];
  if(!row)throw new WebError('DEMO_SESSION_EXPIRED',401);
  return row as {id:string;group_id:string;catalog:unknown;expires_at:Date;active_user_id:string};
 }
 async identity(token:string,role:DemoRole){
  if(!Object.hasOwn(demoRoles,role))throw new WebError('INVALID_REQUEST');
  const workspace=await this.workspace(token);
  const row=(await this.pool.query('SELECT user_id,email,display_name FROM demo_identities WHERE workspace_id=$1 AND role=$2',[workspace.id,role])).rows[0];
  if(!row)throw new WebError('DEMO_UNAVAILABLE',503);
  return {workspace,...row,role,password:demoPassword(this.config.key,workspace.id,role)} as {workspace:typeof workspace;user_id:string;email:string;display_name:string;role:DemoRole;password:string};
 }
 async currentIdentity(token:string){
  const workspace=await this.workspace(token),row=(await this.pool.query('SELECT role FROM demo_identities WHERE workspace_id=$1 AND user_id=$2',[workspace.id,workspace.active_user_id])).rows[0];
  if(!row)throw new WebError('DEMO_UNAVAILABLE',503);return this.identity(token,row.role);
 }
 async activate(token:string,previousUserId:string,userId:string){
  z.uuid().parse(previousUserId);z.uuid().parse(userId);const workspace=await this.workspace(token);
  const updated=await this.pool.query("UPDATE demo_workspaces SET active_user_id=$3 WHERE id=$1 AND active_user_id=$2 AND state='LEASED' AND expires_at>clock_timestamp() AND EXISTS(SELECT 1 FROM demo_identities WHERE workspace_id=$1 AND user_id=$3)",[workspace.id,previousUserId,userId]);
  if(!updated.rowCount)throw new WebError('VIEWER_CHANGED',409);
 }
 async bind(token:string,userId:string,requireActive=false){
  z.uuid().parse(userId);const workspace=await this.workspace(token);
  const row=(await this.pool.query('SELECT role,display_name FROM demo_identities WHERE workspace_id=$1 AND user_id=$2',[workspace.id,userId])).rows[0];
  if(!row)throw new WebError('DEMO_SESSION_REQUIRED',403);
  if(requireActive&&workspace.active_user_id!==userId)throw new WebError('VIEWER_CHANGED',409);
  return {workspaceId:workspace.id,groupId:workspace.group_id,role:row.role as DemoRole,displayName:row.display_name as string,expiresAt:workspace.expires_at.toISOString()};
 }
}
