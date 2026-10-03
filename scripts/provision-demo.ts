import {mkdir,readFile,stat,writeFile} from 'node:fs/promises';
import {randomBytes,randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {z} from 'zod';
import {database} from '../src/db.ts';
import {catalogSchema} from '../src/planning/domain.ts';
import {DemoProvisioner} from '../src/demo/provision.ts';
import {ManagedDemoAccounts} from '../src/demo/admin-accounts.ts';
import {demoConfig} from '../src/demo/access.ts';

// Explicit offline command; privileged management/Admin keys never enter runtime.
async function run(){
 if(process.env.ENABLE_DEMO_AUTH_PROVISION!=='true')throw new Error('EXPLICIT_DEMO_AUTH_PROVISION_REQUIRED');
 const url=new URL(process.env.SUPABASE_URL??''),token=process.env.SUPABASE_MANAGEMENT_TOKEN;
 if(url.protocol!=='https:'||!/^([a-z0-9]+)\.supabase\.co$/.test(url.hostname)||!token?.startsWith('sbp_'))throw new Error('DEMO_MANAGEMENT_CONFIGURATION_REQUIRED');
 const ref=url.hostname.split('.')[0],base=`https://api.supabase.com/v1/projects/${ref}`;
 const request=async(path:string)=>{const r=await fetch(base+path,{redirect:'error',signal:AbortSignal.timeout(30000),headers:{Authorization:`Bearer ${token}`}});if(!r.ok)throw new Error(`DEMO_MANAGEMENT_HTTP_${r.status}`);return r.json();};
 const project=await request('');if(project.name!==(process.env.HOSTED_PROJECT_NAME??'Rally')||project.status!=='ACTIVE_HEALTHY')throw new Error('DEMO_PROJECT_CHECK_FAILED');
 const checkpoint='evidence/private/demo-provision-checkpoint.json',env='.env.demo';
 await mkdir('evidence/private',{recursive:true});
 let saved:{ref:string;key:string;code:string;workspaceIds:string[]};
 try{if(((await stat(checkpoint)).mode&0o777)!==0o600)throw new Error('PRIVATE_CHECKPOINT_MODE_REQUIRED');saved=JSON.parse(await readFile(checkpoint,'utf8'));}
 catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;saved={ref,key:randomBytes(32).toString('hex'),code:randomBytes(24).toString('base64url'),workspaceIds:Array.from({length:5},()=>randomUUID())};await writeFile(checkpoint,JSON.stringify(saved,null,2)+'\n',{flag:'wx',mode:0o600});}
 if(saved.ref!==ref||saved.workspaceIds.length!==5||new Set(saved.workspaceIds).size!==5)throw new Error('DEMO_CHECKPOINT_MISMATCH');
 for(const id of saved.workspaceIds)z.uuid().parse(id);
 Object.assign(process.env,{RALLY_DEMO_ENABLED:'true',RALLY_DEMO_KEY:saved.key,RALLY_DEMO_ACCESS_CODE:saved.code});const config=demoConfig();
 try{if(((await stat(env)).mode&0o777)!==0o600)throw new Error('PRIVATE_ENV_MODE_REQUIRED');const old=await readFile(env,'utf8');if(old!==`RALLY_DEMO_ENABLED=true\nRALLY_DEMO_KEY=${config.key}\nRALLY_DEMO_ACCESS_CODE=${config.code}\n`)throw new Error('DEMO_ENV_CHECKPOINT_MISMATCH');}
 catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;await writeFile(env,`RALLY_DEMO_ENABLED=true\nRALLY_DEMO_KEY=${config.key}\nRALLY_DEMO_ACCESS_CODE=${config.code}\n`,{flag:'wx',mode:0o600});}
 const keys=await request('/api-keys'),adminKey=keys.find((k:{name:string;api_key:string})=>k.name==='service_role')?.api_key;
 if(!adminKey)throw new Error('DEMO_ADMIN_KEY_UNAVAILABLE');
 const admin=createClient(url.toString(),adminKey,{auth:{autoRefreshToken:false,persistSession:false},global:{fetch:(input,init)=>fetch(input,{...init,redirect:'error',signal:AbortSignal.timeout(30000)})}});
 const fixture=catalogSchema.parse(JSON.parse(await readFile('fixtures/studio.json','utf8'))),pool=database(),accounts=new ManagedDemoAccounts(admin);
 try{
  const provisioner=new DemoProvisioner(pool,accounts,config.key,z.string().regex(/^[A-Z0-9]{5,127}$/).parse(process.env.PAYPAL_MERCHANT_ID),fixture);
  const results=[];for(const id of saved.workspaceIds)results.push(await provisioner.provision(id));
  console.log(JSON.stringify({workspaces:results.length,ready:results.filter(r=>r.state==='AVAILABLE').length,leased:results.filter(r=>r.state==='LEASED').length,syntheticIdentities:results.length*7,privateConfiguration:env,outboundEmailCalls:0}));
 }finally{await pool.end();}
}
try{await run();}catch(e){const code=e instanceof Error?e.message:'';console.error(/^[A-Z][A-Z_0-9]+$/.test(code)?code:'DEMO_PROVISION_FAILED');process.exitCode=1;}
