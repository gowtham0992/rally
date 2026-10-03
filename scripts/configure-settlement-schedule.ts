import {readFile} from 'node:fs/promises';
import {appOrigin} from '../src/web/security.ts';
// Offline management command. The runtime receives only the trigger key, not
// the management token, Vault privileges, or permission to edit the Cron job.
async function run(){
 if(process.env.ENABLE_HOSTED_SETTLEMENT_SCHEDULE!=='true')throw new Error('EXPLICIT_SETTLEMENT_SCHEDULE_SETUP_REQUIRED');
 const token=process.env.SUPABASE_MANAGEMENT_TOKEN,url=new URL(process.env.SUPABASE_URL??''),origin=appOrigin(),key=process.env.RALLY_SETTLEMENT_TRIGGER_KEY;
 if(origin!=='https://rally.gowthamsarveswaran.com'||!key||!/^[a-f0-9]{64}$/.test(key)||process.env.RALLY_SETTLEMENT_MODE!=='scheduled'||!token?.startsWith('sbp_')||url.protocol!=='https:'||!/^([a-z0-9]+)\.supabase\.co$/.test(url.hostname))throw new Error('SETTLEMENT_SCHEDULE_CONFIG_REQUIRED');
 const base=`https://api.supabase.com/v1/projects/${url.hostname.split('.')[0]}`;
 const request=async(path:string,body?:unknown)=>{const r=await fetch(base+path,{method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(30000),headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});if(!r.ok)throw new Error(`SETTLEMENT_MANAGEMENT_HTTP_${r.status}`);return r.json();};
 const project=await request('');if(project.name!==(process.env.HOSTED_PROJECT_NAME??'Rally')||project.status!=='ACTIVE_HEALTHY')throw new Error('SETTLEMENT_PROJECT_CHECK_FAILED');
 // Installation requires an already verified live hostname and authenticated
 // tick. Never silently point the job at localhost or an unverified deployment.
 const live=await fetch(`${origin}/api/internal/settlement`,{method:'POST',redirect:'error',signal:AbortSignal.timeout(120000),headers:{Authorization:`Bearer ${key}`}});
 if(!live.ok)throw new Error('LIVE_SETTLEMENT_TRIGGER_REQUIRED');
 const result=await live.json();if(!['IDLE','PROCESSED','BUSY'].includes(result.state))throw new Error('INVALID_SETTLEMENT_TRIGGER_RESPONSE');
 const sql=await readFile(new URL('../deploy/settlement-schedule.sql',import.meta.url),'utf8');
 if(!sql.includes('__RALLY_TRIGGER_KEY__'))throw new Error('SCHEDULE_TEMPLATE_INVALID');
 await request('/database/query',{query:sql.replaceAll('__RALLY_TRIGGER_KEY__',key),read_only:false});
 const audit=await request('/database/query',{query:`SELECT (SELECT count(*) FROM cron.job WHERE jobname='rally-sandbox-settlement' AND active) AS jobs,
 has_function_privilege('rally_app','rally_private.request_settlement_tick()','EXECUTE') AS runtime_can_invoke,
 has_table_privilege('anon','vault.decrypted_secrets','SELECT') AS browser_can_read_secret,
 has_table_privilege('authenticated','vault.decrypted_secrets','SELECT') AS signed_in_can_read_secret`,read_only:true});
 if(Number(audit[0].jobs)!==1||audit[0].runtime_can_invoke||audit[0].browser_can_read_secret||audit[0].signed_in_can_read_secret)throw new Error('SETTLEMENT_SCHEDULE_AUDIT_FAILED');
 console.log(JSON.stringify({activeJobs:1,cadence:'every minute when payment work exists',runtimeCanEditSchedule:false,browserCanReadSecret:false,paidServicesCreated:0}));
}
try{await run();}catch(e){const code=e instanceof Error?e.message:'';console.error(/^[A-Z][A-Z_0-9]+$/.test(code)?code:'SETTLEMENT_SCHEDULE_SETUP_FAILED');process.exitCode=1;}
