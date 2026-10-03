import {readFile} from 'node:fs/promises';
import {z} from 'zod';
async function run(){
 if(process.env.ENABLE_HOSTED_PRIVATE_TEXT_RETENTION!=='true')throw new Error('EXPLICIT_PRIVATE_TEXT_RETENTION_SETUP_REQUIRED');
 const days=z.coerce.number().int().min(1).max(365).parse(process.env.RALLY_PRIVATE_TEXT_RETENTION_DAYS??30);
 const token=process.env.SUPABASE_MANAGEMENT_TOKEN,url=new URL(process.env.SUPABASE_URL??'');
 if(!token?.startsWith('sbp_')||url.protocol!=='https:'||!/^([a-z0-9]+)\.supabase\.co$/.test(url.hostname))throw new Error('PRIVATE_TEXT_RETENTION_CONFIG_REQUIRED');
 const base=`https://api.supabase.com/v1/projects/${url.hostname.split('.')[0]}`;
 const request=async(path:string,body?:unknown)=>{const r=await fetch(base+path,{method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(30000),headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});if(!r.ok)throw new Error(`RETENTION_MANAGEMENT_HTTP_${r.status}`);return r.json();};
 const project=await request('');if(project.name!==(process.env.HOSTED_PROJECT_NAME??'Rally')||project.status!=='ACTIVE_HEALTHY')throw new Error('RETENTION_PROJECT_CHECK_FAILED');
 const sql=await readFile(new URL('../deploy/private-text-retention.sql',import.meta.url),'utf8');
 if(!sql.includes('__RETENTION_DAYS__'))throw new Error('RETENTION_TEMPLATE_INVALID');
 await request('/database/query',{query:sql.replaceAll('__RETENTION_DAYS__',String(days)),read_only:false});
 const audit=await request('/database/query',{query:`SELECT (SELECT count(*) FROM cron.job WHERE jobname='rally-private-text-retention' AND active AND schedule='* * * * *' AND command='SELECT rally_private.purge_expired_private_text(100);')::int AS jobs,
  (SELECT retention_days FROM rally_private.private_text_retention_policy WHERE singleton) AS days,
  has_function_privilege('anon','rally_private.purge_expired_private_text(integer)','EXECUTE') AS browser_can_execute,
  has_function_privilege('authenticated','rally_private.purge_expired_private_text(integer)','EXECUTE') AS signed_in_can_execute,
  has_table_privilege('rally_app','rally_private.private_text_retention_policy','UPDATE') AS runtime_can_change_policy`,read_only:true});
 if(audit[0].jobs!==1||audit[0].days!==days||audit[0].browser_can_execute||audit[0].signed_in_can_execute||audit[0].runtime_can_change_policy)throw new Error('RETENTION_SCHEDULE_AUDIT_FAILED');
 console.log(JSON.stringify({activeJobs:1,cadence:'every minute inside PostgreSQL',retentionDays:days,runtimeCanChangePolicy:false,browserCanExecute:false,cleanupHttpRequestsPerTick:0,paidServicesCreated:0}));
}
try{await run();}catch(e){const code=e instanceof Error?e.message:'';console.error(/^[A-Z][A-Z_0-9]+$/.test(code)?code:'PRIVATE_TEXT_RETENTION_SETUP_FAILED');process.exitCode=1;}
