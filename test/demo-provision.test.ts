import {test,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import type pg from 'pg';
import type {SupabaseClient} from '@supabase/supabase-js';
import {database,localDatabaseUrl} from '../src/db.ts';
import {migrationVersions} from '../src/migrations.ts';
import {catalogSchema} from '../src/planning/domain.ts';
import {DemoProvisioner,demoMetadata,type DemoAccounts,type DemoAccount} from '../src/demo/provision.ts';
import {ManagedDemoAccounts} from '../src/demo/admin-accounts.ts';
let pool:pg.Pool,admin:pg.Pool,schema:string;
const catalog=catalogSchema.parse(JSON.parse(await readFile(new URL('../fixtures/studio.json',import.meta.url),'utf8')));
beforeEach(async()=>{schema=`demo_provision_${randomUUID().replaceAll('-','')}`;const base=process.env.TEST_DATABASE_URL??localDatabaseUrl;admin=database(base);await admin.query(`CREATE SCHEMA ${schema}`);const url=new URL(base);url.searchParams.set('options',`-c search_path=${schema},public`);pool=database(url.toString());for(const v of migrationVersions)await pool.query(await readFile(new URL(`../db/${v}.sql`,import.meta.url),'utf8'));});
afterEach(async()=>{await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();});
class Accounts implements DemoAccounts{
 users=new Map<string,DemoAccount>();failOnce=false;calls=0;
 async ensure(input:Parameters<DemoAccounts['ensure']>[0]){
  this.calls++;let user=this.users.get(input.email);
  if(!user){user={id:randomUUID(),email:input.email,email_confirmed_at:new Date().toISOString(),app_metadata:demoMetadata(input.workspaceId,input.role)};this.users.set(input.email,user);}
  if(this.failOnce&&input.role==='COLLECTOR'){this.failOnce=false;throw new Error('synthetic dropped create response');}return user;
 }
}
test('offline preparation creates distinct roles and four labeled fixture preferences, never consent or a booking',async()=>{
 const accounts=new Accounts(),provision=new DemoProvisioner(pool,accounts,'a'.repeat(64),'synthetic_merchant',catalog),id=randomUUID();
 const result=await provision.provision(id);assert.equal(result.state,'AVAILABLE');assert.equal(accounts.users.size,7);
 const members=(await pool.query('SELECT display_name,current_preference_id,admitted FROM planning_members WHERE group_id=$1',[result.groupId])).rows;
 assert.equal(members.length,6);assert.equal(members.filter(m=>m.current_preference_id).length,4);assert.ok(members.every(m=>!m.admitted));
 for(const name of ['Alex','Sam'])assert.equal(members.find(m=>m.display_name===name).current_preference_id,null);
 for(const table of ['collection_consents','merchant_requests','offers','payment_operations'])assert.equal((await pool.query(`SELECT count(*) FROM ${table}`)).rows[0].count,'0');
 const studio=(await pool.query('SELECT owner_user_id,resource_id FROM merchant_studios')).rows[0];assert.equal(studio.resource_id,`demo-resource-${id}`);
 assert.equal(studio.owner_user_id,(await pool.query("SELECT user_id FROM demo_identities WHERE role='STUDIO'")).rows[0].user_id);
 const snapshot=JSON.stringify((await pool.query('SELECT * FROM preference_revisions')).rows);
 await provision.provision(id);assert.equal(accounts.calls,7);assert.equal(JSON.stringify((await pool.query('SELECT * FROM preference_revisions')).rows),snapshot);
});
test('a lost account creation response leaves a quarantined workspace and resumes without duplicate identities or groups',async()=>{
 const accounts=new Accounts();accounts.failOnce=true;const provision=new DemoProvisioner(pool,accounts,'a'.repeat(64),'synthetic_merchant',catalog),id=randomUUID();
 await assert.rejects(provision.provision(id),/synthetic dropped/);assert.equal((await pool.query('SELECT state FROM demo_workspaces')).rows[0].state,'PROVISIONING');
 assert.equal(accounts.users.size,3);assert.equal((await pool.query('SELECT count(*) FROM demo_identities')).rows[0].count,'2');
 await provision.provision(id);assert.equal(accounts.users.size,7);assert.equal((await pool.query('SELECT count(*) FROM planning_groups')).rows[0].count,'1');
 assert.equal((await pool.query('SELECT count(*) FROM demo_identities')).rows[0].count,'7');
});
test('concurrent resumption provisions once and mismatched trusted metadata cannot become available',async()=>{
 const accounts=new Accounts(),provision=new DemoProvisioner(pool,accounts,'a'.repeat(64),'synthetic_merchant',catalog),id=randomUUID();
 const results=await Promise.all([provision.provision(id),provision.provision(id)]);assert.equal(results.filter(r=>r.created).length,1);assert.equal(accounts.calls,7);
 const wrong:DemoAccounts={ensure:async input=>({id:randomUUID(),email:input.email,email_confirmed_at:new Date().toISOString(),app_metadata:demoMetadata(randomUUID(),input.role)})};
 await assert.rejects(new DemoProvisioner(pool,wrong,'a'.repeat(64),'synthetic_merchant',catalog).provision(randomUUID()),/DEMO_ACCOUNT_SCOPE_MISMATCH/);
 assert.equal((await pool.query("SELECT count(*) FROM demo_workspaces WHERE state='PROVISIONING'")).rows[0].count,'1');
});
test('Admin recovery adopts only the exact confirmed synthetic metadata and never changes an existing password',async()=>{
 const workspaceId=randomUUID(),role='ORGANIZER' as const,email=`organizer.${workspaceId}@rally-demo.invalid`,users:DemoAccount[]=[];let creates=0,lists=0;
 const adminClient={auth:{admin:{
  listUsers:async()=>{lists++;return {data:{users},error:null};},
  createUser:async()=>{creates++;users.push({id:randomUUID(),email,email_confirmed_at:new Date().toISOString(),app_metadata:demoMetadata(workspaceId,role)});throw new Error('synthetic transport loss');},
  getUserById:async(id:string)=>({data:{user:users.find(u=>u.id===id)},error:null})
 }}} as unknown as SupabaseClient;
 const accounts=new ManagedDemoAccounts(adminClient),input={workspaceId,role,email,password:'synthetic-secret'};
 const first=await accounts.ensure(input);assert.equal(creates,1);assert.equal(lists,2);
 assert.equal((await accounts.ensure(input)).id,first.id);assert.equal(creates,1);
 users[0].app_metadata={};await assert.rejects(accounts.ensure(input),/DEMO_ACCOUNT_SCOPE_MISMATCH/);assert.equal(creates,1);
});
