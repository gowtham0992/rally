import {readFile,stat,writeFile} from 'node:fs/promises';
// Offline owner operation only. Never import Management API credentials into
// application routes, worker bundles or browser code. Dry-run is the default.
async function run(){
 const checkpoint='evidence/private/hosted-role-checkpoint.json';if(((await stat(checkpoint)).mode&0o777)!==0o600)throw Error('PRIVATE_CHECKPOINT_MODE_REQUIRED');
 const saved=JSON.parse(await readFile(checkpoint,'utf8')),url=new URL(process.env.SUPABASE_URL??''),token=process.env.SUPABASE_MANAGEMENT_TOKEN;
 if(url.protocol!=='https:'||url.hostname!==`${saved.ref}.supabase.co`||!token?.startsWith('sbp_'))throw Error('HOSTED_PROJECT_CHECKPOINT_MISMATCH');
 const endpoint=`https://api.supabase.com/v1/projects/${saved.ref}`;
 async function request(path:string,value?:unknown){const r=await fetch(endpoint+path,{method:value?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(30000),headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:value?JSON.stringify(value):undefined});if(!r.ok)throw Error(`QUESTION_MIGRATION_HTTP_${r.status}`);return r.json();}
 const project=await request('');if(project.name!=='Rally'||project.status!=='ACTIVE_HEALTHY')throw Error('QUESTION_PROJECT_CHECK_FAILED');
 const query=(sql:string,read_only=true)=>request('/database/query',{query:sql,read_only});
 const before=(await query("SELECT count(*)::int AS applied,current_setting('server_version') AS database_version FROM rally_private.schema_migrations WHERE version='017_studio_questions'"))[0];
 if(!process.argv.includes('--apply')){console.log(JSON.stringify({dryRun:true,version:'017_studio_questions',alreadyApplied:before.applied===1,databaseVersion:before.database_version,scope:'Private opt-in studio exchanges and disabled-by-default AI drafts. Reuses existing bounded retention job. No accounts, emails or payment operations.'}));return;}
 if(process.env.ENABLE_STUDIO_QUESTIONS_MIGRATION!=='true')throw Error('EXPLICIT_QUESTION_MIGRATION_REQUIRED');
 const source=await readFile('db/017_studio_questions.sql','utf8'),tag='$rally_question_migration$';if(source.includes(tag))throw Error('MIGRATION_DELIMITER_COLLISION');
 await query(`BEGIN;SELECT pg_advisory_xact_lock(728119);SET LOCAL ROLE rally_owner;SET LOCAL search_path TO rally_private,extensions;
 DO $prior$ BEGIN IF NOT EXISTS(SELECT 1 FROM schema_migrations WHERE version='016_message_drafts') THEN RAISE EXCEPTION 'Prior migration required';END IF;END $prior$;
 DO $apply$ BEGIN IF NOT EXISTS(SELECT 1 FROM schema_migrations WHERE version='017_studio_questions') THEN EXECUTE ${tag}${source}${tag};INSERT INTO schema_migrations VALUES('017_studio_questions');END IF;END $apply$;COMMIT;`,false);
 const audit=(await query(`SELECT
 (SELECT count(*)::int FROM rally_private.schema_migrations WHERE version='017_studio_questions') AS applied,
 (SELECT count(*)::int FROM pg_class WHERE oid IN ('rally_private.studio_questions'::regclass,'rally_private.studio_question_drafts'::regclass) AND relrowsecurity) AS private_tables,
 (SELECT count(*)::int FROM rally_private.studio_questions) AS question_rows,
 (SELECT count(*)::int FROM rally_private.studio_question_drafts) AS draft_rows,
 has_table_privilege('anon','rally_private.studio_questions','SELECT') OR has_table_privilege('authenticated','rally_private.studio_questions','SELECT') OR has_table_privilege('service_role','rally_private.studio_questions','SELECT') OR has_table_privilege('anon','rally_private.studio_question_drafts','SELECT') OR has_table_privilege('authenticated','rally_private.studio_question_drafts','SELECT') OR has_table_privilege('service_role','rally_private.studio_question_drafts','SELECT') AS browser_access,
 NOT EXISTS(SELECT 1 FROM (VALUES('rally_private.studio_questions'),('rally_private.studio_question_drafts')) t(name) CROSS JOIN (VALUES('SELECT'),('INSERT'),('UPDATE')) p(privilege) WHERE NOT has_table_privilege('rally_app',t.name,p.privilege)) AS runtime_access,
 has_function_privilege('anon','rally_private.purge_expired_private_text(integer)','EXECUTE') OR has_function_privilege('authenticated','rally_private.purge_expired_private_text(integer)','EXECUTE') OR has_function_privilege('anon','rally_private.purge_expired_studio_questions(integer)','EXECUTE') AS browser_cleanup,
 has_function_privilege('rally_app','rally_private.purge_expired_private_text(integer)','EXECUTE') AS runtime_cleanup,
 (SELECT count(*)::int FROM cron.job WHERE jobname='rally-private-text-retention' AND active AND command='SELECT rally_private.purge_expired_private_text(100);') AS existing_cleanup_jobs`))[0];
 if(audit.applied!==1||audit.private_tables!==2||audit.browser_access||audit.browser_cleanup||!audit.runtime_access||!audit.runtime_cleanup||audit.existing_cleanup_jobs!==1)throw Error('QUESTION_MIGRATION_AUDIT_FAILED');
 const report={observedAt:new Date().toISOString(),version:'017_studio_questions',databaseVersion:before.database_version,applied:true,privateTableRls:true,browserAccess:false,runtimeAccess:true,existingCleanupJobPreserved:true,initialQuestionRows:audit.question_rows,initialDraftRows:audit.draft_rows,oldPaymentOrPreferenceRowsUpdated:0};
 await writeFile('evidence/studio-question-migration.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}
try{await run();}catch(e){const m=e instanceof Error?e.message:'';console.error(/^[A-Z][A-Z_0-9]+$/.test(m)?m:'QUESTION_MIGRATION_FAILED');process.exitCode=1;}
