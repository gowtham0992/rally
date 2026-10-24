import {readFile,writeFile,stat} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {createClient} from '@supabase/supabase-js';
import {database} from '../src/db.ts';
import {catalogSchema} from '../src/planning/domain.ts';
import {DemoProvisioner} from '../src/demo/provision.ts';
import {ManagedDemoAccounts} from '../src/demo/admin-accounts.ts';
import {JudgingPreparation,judgingCatalog} from '../src/demo/judging.ts';

// Offline, additive capacity. Never resets, recycles or leases an existing group.
async function run(){
 if(process.env.ENABLE_DEMO_AUTH_PROVISION!=='true')throw Error('EXPLICIT_DEMO_AUTH_PROVISION_REQUIRED');
 const apply=process.argv.includes('--apply'),wanted=z.coerce.number().int().min(1).max(20).parse(process.argv.find(a=>a.startsWith('--available='))?.split('=')[1]??10);
 const checkpoint='evidence/private/demo-provision-checkpoint.json',expansion='evidence/private/judge-expansion-checkpoint.json';
 async function privateJson(path:string){if(((await stat(path)).mode&0o777)!==0o600)throw Error('PRIVATE_CHECKPOINT_MODE_REQUIRED');return JSON.parse(await readFile(path,'utf8'));}
 const original=z.object({ref:z.string(),key:z.string().regex(/^[a-f0-9]{64}$/),workspaceIds:z.array(z.uuid()).length(5)}).parse(await privateJson(checkpoint));
 const projectUrl=new URL(process.env.SUPABASE_URL??''),connection=new URL(process.env.DATABASE_URL??'');
 if(projectUrl.protocol!=='https:'||projectUrl.hostname!==`${original.ref}.supabase.co`||connection.searchParams.get('sslmode')!=='verify-full'||connection.searchParams.get('sslrootcert')!=='certs/supabase-ca.crt')throw Error('JUDGING_PROJECT_CHECKPOINT_MISMATCH');
 const pool=database();try{
  const who=(await pool.query('SELECT current_user,current_schema()')).rows[0];
  if(who.current_user!=='rally_app'||who.current_schema!=='rally_private')throw Error('JUDGING_RUNTIME_ROLE_REQUIRED');
  const available=Number((await pool.query("SELECT count(*) FROM demo_workspaces WHERE state='AVAILABLE' AND lease_id IS NULL AND active_user_id IS NULL")).rows[0].count);
  let saved:{ref:string;workspaceIds:string[]};
  try{saved=z.object({ref:z.string(),workspaceIds:z.array(z.uuid()).max(20).refine(ids=>new Set(ids).size===ids.length)}).parse(await privateJson(expansion));}
  catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;saved={ref:original.ref,workspaceIds:[]};}
  if(saved.ref!==original.ref||saved.workspaceIds.some(id=>original.workspaceIds.includes(id)))throw Error('JUDGING_EXPANSION_CHECKPOINT_MISMATCH');
  const incomplete=saved.workspaceIds.length?Number((await pool.query("SELECT count(*) FROM unnest($1::uuid[]) u(id) LEFT JOIN demo_workspaces w ON w.id=u.id WHERE w.id IS NULL OR w.state='PROVISIONING'",[saved.workspaceIds])).rows[0].count):0;
  const additional=Math.max(0,wanted-available-incomplete);
  if(saved.workspaceIds.length+additional>20)throw Error('JUDGING_EXPANSION_LIMIT');
  if(!apply){console.log(JSON.stringify({dryRun:true,untouchedAvailable:available,targetAvailable:wanted,incompleteWorkspaces:incomplete,newWorkspaces:additional,newAuthAccounts:additional*7,emails:0,payments:0}));return;}
  if(additional){saved.workspaceIds.push(...Array.from({length:additional},()=>randomUUID()));await writeFile(expansion,JSON.stringify(saved,null,2)+'\n',{mode:0o600});}
  if(!saved.workspaceIds.length){console.log(JSON.stringify({applied:true,untouchedAvailable:available,newAuthAccounts:0}));return;}
  const token=process.env.SUPABASE_MANAGEMENT_TOKEN;if(!token?.startsWith('sbp_'))throw Error('DEMO_MANAGEMENT_CONFIGURATION_REQUIRED');
  const request=async(path:string)=>{const r=await fetch(`https://api.supabase.com/v1/projects/${original.ref}${path}`,{redirect:'error',signal:AbortSignal.timeout(30000),headers:{Authorization:`Bearer ${token}`}});if(!r.ok)throw Error(`DEMO_MANAGEMENT_HTTP_${r.status}`);return r.json();};
  const project=await request('');if(project.name!==(process.env.HOSTED_PROJECT_NAME??'Rally')||project.status!=='ACTIVE_HEALTHY')throw Error('DEMO_PROJECT_CHECK_FAILED');
  const keys=await request('/api-keys'),adminKey=keys.find((k:{name:string;api_key:string})=>k.name==='service_role')?.api_key;if(!adminKey)throw Error('DEMO_ADMIN_KEY_UNAVAILABLE');
  const admin=createClient(projectUrl.toString(),adminKey,{auth:{autoRefreshToken:false,persistSession:false},global:{fetch:(input,init)=>fetch(input,{...init,redirect:'error',signal:AbortSignal.timeout(30000)})}});
  const fixture=catalogSchema.parse(JSON.parse(await readFile('fixtures/studio.json','utf8'))),replacement=judgingCatalog(fixture);
  const provisioner=new DemoProvisioner(pool,new ManagedDemoAccounts(admin),original.key,z.string().regex(/^[A-Z0-9]{5,127}$/).parse(process.env.PAYPAL_MERCHANT_ID),fixture);
  const before=(await pool.query('SELECT count(*) FROM demo_identities')).rows[0].count;
  for(const id of saved.workspaceIds){
   const existing=(await pool.query('SELECT state,catalog FROM demo_workspaces WHERE id=$1',[id])).rows[0];
   if(!existing||existing.state==='PROVISIONING')await provisioner.provision(id);
  }
  await new JudgingPreparation(pool,fixture,replacement).run(saved.workspaceIds,true);
  const after=Number((await pool.query("SELECT count(*) FROM demo_workspaces WHERE state='AVAILABLE' AND lease_id IS NULL AND active_user_id IS NULL")).rows[0].count);
  const report={observedAt:new Date().toISOString(),applied:true,untouchedAvailable:after,targetAvailable:wanted,newAuthAccounts:Number((await pool.query('SELECT count(*) FROM demo_identities')).rows[0].count)-Number(before),totalWorkspaces:Number((await pool.query('SELECT count(*) FROM demo_workspaces')).rows[0].count),existingWorkspacesRecycled:0,emailsSent:0,paymentsInitiated:0,consentsRecorded:0,scope:'Additive fictional judge identities and untouched planning groups in the existing Free project; original five workspace histories retained.'};
  await writeFile('evidence/judge-capacity-2026-10-23.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
 }finally{await pool.end();}
}
try{await run();}catch(e){const code=e instanceof Error?e.message:'';console.error(/^[A-Z][A-Z_0-9]+$/.test(code)?code:'JUDGING_EXPANSION_FAILED');process.exitCode=1;}
