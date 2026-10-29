import {readFile,stat,writeFile} from 'node:fs/promises';
async function run(){
 if(process.env.ENABLE_MESSAGE_DRAFT_MIGRATION!=='true')throw Error('EXPLICIT_DRAFT_MIGRATION_REQUIRED');
 const checkpoint='evidence/private/hosted-role-checkpoint.json';if(((await stat(checkpoint)).mode&0o777)!==0o600)throw Error('PRIVATE_CHECKPOINT_MODE_REQUIRED');
 const saved=JSON.parse(await readFile(checkpoint,'utf8')),url=new URL(process.env.SUPABASE_URL??''),token=process.env.SUPABASE_MANAGEMENT_TOKEN;
 if(url.protocol!=='https:'||url.hostname!==`${saved.ref}.supabase.co`||!token?.startsWith('sbp_'))throw Error('HOSTED_PROJECT_CHECKPOINT_MISMATCH');
 const endpoint=`https://api.supabase.com/v1/projects/${saved.ref}`,request=async(path:string,value?:unknown)=>{const r=await fetch(endpoint+path,{method:value?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(30000),headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:value?JSON.stringify(value):undefined});if(!r.ok)throw Error(`DRAFT_MIGRATION_HTTP_${r.status}`);return r.json();};
 const project=await request('');if(project.name!=='Rally'||project.status!=='ACTIVE_HEALTHY')throw Error('DRAFT_PROJECT_CHECK_FAILED');
 const query=(sql:string,read_only=true)=>request('/database/query',{query:sql,read_only});
 const before=(await query("SELECT count(*)::int AS applied FROM rally_private.schema_migrations WHERE version='016_message_drafts'"))[0];
 if(!process.argv.includes('--apply')){console.log(JSON.stringify({dryRun:true,version:'016_message_drafts',alreadyApplied:before.applied===1,scope:'Separate private unconfirmed drafts, immutable 30-minute expiry and the existing database cleanup entry point. No old data or financial transitions changed.'}));return;}
 const source=await readFile('db/016_message_drafts.sql','utf8'),tag='$rally_message_migration$';if(source.includes(tag))throw Error('MIGRATION_DELIMITER_COLLISION');
 await query(`BEGIN;SELECT pg_advisory_xact_lock(728119);SET LOCAL ROLE rally_owner;SET LOCAL search_path TO rally_private,extensions;
 DO $prior$ BEGIN IF NOT EXISTS(SELECT 1 FROM schema_migrations WHERE version='015_planning_roster') THEN RAISE EXCEPTION 'Prior migration required';END IF;END $prior$;
 DO $apply$ BEGIN IF NOT EXISTS(SELECT 1 FROM schema_migrations WHERE version='016_message_drafts') THEN EXECUTE ${tag}${source}${tag};INSERT INTO schema_migrations VALUES('016_message_drafts');END IF;END $apply$;COMMIT;`,false);
 const audit=(await query(`SELECT
 (SELECT count(*)::int FROM rally_private.schema_migrations WHERE version='016_message_drafts') AS applied,
 (SELECT relrowsecurity FROM pg_class WHERE oid='rally_private.intake_message_drafts'::regclass) AS rls,
 (SELECT count(*)::int FROM rally_private.intake_message_drafts) AS draft_rows,
 has_table_privilege('anon','rally_private.intake_message_drafts','SELECT') AS anonymous_read,
 has_table_privilege('authenticated','rally_private.intake_message_drafts','SELECT') AS browser_read,
 (has_table_privilege('rally_app','rally_private.intake_message_drafts','SELECT') AND has_table_privilege('rally_app','rally_private.intake_message_drafts','INSERT') AND has_table_privilege('rally_app','rally_private.intake_message_drafts','UPDATE')) AS runtime_access,
 has_function_privilege('anon','rally_private.purge_expired_message_drafts(integer)','EXECUTE') AS anonymous_cleanup,
 has_function_privilege('authenticated','rally_private.purge_expired_private_text(integer)','EXECUTE') AS browser_cleanup,
 (SELECT count(*)::int FROM cron.job WHERE jobname='rally-private-text-retention' AND active AND command='SELECT rally_private.purge_expired_private_text(100);') AS existing_cleanup_jobs`))[0];
 if(audit.applied!==1||!audit.rls||audit.anonymous_read||audit.browser_read||audit.anonymous_cleanup||audit.browser_cleanup||!audit.runtime_access||audit.existing_cleanup_jobs!==1)throw Error('DRAFT_MIGRATION_AUDIT_FAILED');
 const report={observedAt:new Date().toISOString(),version:'016_message_drafts',applied:true,privateTableRls:true,browserAccess:false,runtimeAccess:true,existingCleanupJobPreserved:true,initialDraftRows:audit.draft_rows,oldPaymentOrPreferenceRowsUpdated:0};
 await writeFile('evidence/message-draft-migration.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}
try{await run();}catch(e){const m=e instanceof Error?e.message:'';console.error(/^[A-Z][A-Z_0-9]+$/.test(m)?m:'DRAFT_MIGRATION_FAILED');process.exitCode=1;}
