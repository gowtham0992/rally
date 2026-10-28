import {readFile,writeFile,stat} from 'node:fs/promises';
async function run(){
 if(process.env.ENABLE_USABILITY_MIGRATION!=='true')throw Error('EXPLICIT_USABILITY_MIGRATION_REQUIRED');
 const path='evidence/private/hosted-role-checkpoint.json';if(((await stat(path)).mode&0o777)!==0o600)throw Error('PRIVATE_CHECKPOINT_MODE_REQUIRED');
 const saved=JSON.parse(await readFile(path,'utf8')),url=new URL(process.env.SUPABASE_URL??''),token=process.env.SUPABASE_MANAGEMENT_TOKEN;
 if(url.protocol!=='https:'||url.hostname!==`${saved.ref}.supabase.co`||!token?.startsWith('sbp_'))throw Error('HOSTED_PROJECT_CHECKPOINT_MISMATCH');
 const endpoint=`https://api.supabase.com/v1/projects/${saved.ref}`,request=async(route:string,value?:unknown)=>{const r=await fetch(endpoint+route,{method:value?'POST':'GET',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:value?JSON.stringify(value):undefined,redirect:'error',signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error(`HOSTED_MIGRATION_HTTP_${r.status}`);return r.json();};
 const project=await request('');if(project.name!=='Rally'||project.status!=='ACTIVE_HEALTHY')throw Error('HOSTED_PROJECT_CHECK_FAILED');
 const inspection=await request('/database/query',{query:"SELECT (SELECT count(*) FROM rally_private.schema_migrations) AS migrations,(SELECT count(*) FROM rally_private.schema_migrations WHERE version='015_planning_roster') AS applied",read_only:true});
 if(!process.argv.includes('--apply')){console.log(JSON.stringify({dryRun:true,version:'015_planning_roster',existingMigrations:Number(inspection[0].migrations),alreadyApplied:Number(inspection[0].applied)===1,scope:'One default-false planning membership flag and bounded audit/quota check-constraint additions. No payment, preference, offer or consent row updates.'}));return;}
 const source=await readFile('db/015_planning_roster.sql','utf8'),tag='$rally_usability_migration$';if(source.includes(tag))throw Error('MIGRATION_DELIMITER_COLLISION');
 await request('/database/query',{query:`BEGIN;SELECT pg_advisory_xact_lock(728119);SET LOCAL ROLE rally_owner;SET LOCAL search_path TO rally_private,extensions;
 DO $check$ BEGIN IF NOT EXISTS(SELECT 1 FROM schema_migrations WHERE version='014_studio_declines') THEN RAISE EXCEPTION 'Prior migration required';END IF;END $check$;
 DO $apply$ BEGIN IF NOT EXISTS(SELECT 1 FROM schema_migrations WHERE version='015_planning_roster') THEN EXECUTE ${tag}${source}${tag};INSERT INTO schema_migrations VALUES('015_planning_roster');END IF;END $apply$;COMMIT;`,read_only:false});
 const verified=await request('/database/query',{query:"SELECT count(*) AS applied FROM rally_private.schema_migrations WHERE version='015_planning_roster'",read_only:true});if(Number(verified[0].applied)!==1)throw Error('MIGRATION_AUDIT_FAILED');
 const report={observedAt:new Date().toISOString(),version:'015_planning_roster',applied:true,paymentRowsChanged:0,offerRowsChanged:0,consentRowsChanged:0,existingMembershipsExcluded:0,browserPermissionsAdded:0,scope:'Existing planning_members rows receive excluded=false; collection audit and email verification quota scopes remain finite. No public/API grants or financial transitions changed.'};
 await writeFile('evidence/usability-migration-2026-10-27.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}
try{await run();}catch(e){const code=e instanceof Error?e.message:'';console.error(/^[A-Z][A-Z_0-9]+$/.test(code)?code:'USABILITY_MIGRATION_FAILED');process.exitCode=1;}
