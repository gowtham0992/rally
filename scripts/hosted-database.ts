import {readFile,writeFile,stat,mkdir} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {migrationVersions} from '../src/migrations.ts';
const token=process.env.SUPABASE_MANAGEMENT_TOKEN,url=process.env.SUPABASE_URL;
if(!token?.startsWith('sbp_')||!url)throw new Error('HOSTED_PROVISION_CONFIGURATION_REQUIRED');
const projectUrl=new URL(url);
if(projectUrl.protocol!=='https:'||!/^([a-z0-9]+)\.supabase\.co$/.test(projectUrl.hostname))throw new Error('INVALID_PROJECT_URL');
const ref=projectUrl.hostname.split('.')[0],base=`https://api.supabase.com/v1/projects/${ref}`;
const checkpoint='evidence/private/hosted-role-checkpoint.json';
async function request(path:string,body?:unknown){
 const response=await fetch(base+path,{method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(30000),headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
 if(!response.ok)throw new Error(`HOSTED_MANAGEMENT_HTTP_${response.status}`);
 return response.json();
}
async function run(){
 const project=await request('');
 if(project.name!==(process.env.HOSTED_PROJECT_NAME??'Rally')||project.status!=='ACTIVE_HEALTHY')throw new Error('HOSTED_PROJECT_CHECK_FAILED');
 const query=(sql:string)=>request('/database/query',{query:sql,read_only:false});
 const inspection=await query("SELECT (SELECT count(*) FROM pg_namespace WHERE nspname='rally_private') AS schemas,(SELECT count(*) FROM pg_roles WHERE rolname IN ('rally_owner','rally_app')) AS roles");
 let saved:{ref:string;password:string};
 try {const mode=(await stat(checkpoint)).mode&0o777;if(mode!==0o600)throw new Error('PRIVATE_CHECKPOINT_MODE_REQUIRED');saved=JSON.parse(await readFile(checkpoint,'utf8'));}
 catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;if(Number(inspection[0].schemas)||Number(inspection[0].roles))throw new Error('EXISTING_ROLE_CHECKPOINT_REQUIRED');await mkdir('evidence/private',{recursive:true});saved={ref,password:randomBytes(32).toString('hex')};await writeFile(checkpoint,JSON.stringify(saved,null,2)+'\n',{mode:0o600,flag:'wx'});}
 if(saved.ref!==ref||!/^[a-f0-9]{64}$/.test(saved.password))throw new Error('PRIVATE_CHECKPOINT_MISMATCH');
 const bootstrap=Number(inspection[0].schemas)===0?`
  CREATE ROLE rally_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  CREATE ROLE rally_app LOGIN PASSWORD '${saved.password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 24;
  GRANT rally_owner TO postgres;
  CREATE SCHEMA rally_private AUTHORIZATION rally_owner;
  ALTER ROLE rally_owner SET search_path TO rally_private,extensions;
  ALTER ROLE rally_app SET search_path TO rally_private,extensions;` : '';
 const migrations=await Promise.all(migrationVersions.map(async(version,index)=>{
  const sql=await readFile(new URL(`../db/${version}.sql`,import.meta.url),'utf8'),tag=`$rally_migration_${index}$`;
  if(sql.includes(tag))throw new Error('MIGRATION_DELIMITER_COLLISION');
  return `DO $apply$ BEGIN IF NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version='${version}') THEN EXECUTE ${tag}${sql}${tag}; INSERT INTO schema_migrations VALUES ('${version}'); END IF; END $apply$;`;
 }));
 await query(`BEGIN;SELECT pg_advisory_xact_lock(728119);${bootstrap}
  DO $check$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_namespace n JOIN pg_roles r ON r.oid=n.nspowner WHERE n.nspname='rally_private' AND r.rolname='rally_owner') OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN ('rally_app','rally_owner') AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls)) THEN RAISE EXCEPTION 'Hosted role scope mismatch'; END IF;END $check$;
  REVOKE ALL ON SCHEMA rally_private FROM PUBLIC,anon,authenticated,service_role;
  GRANT USAGE ON SCHEMA rally_private TO rally_app;
  GRANT USAGE ON SCHEMA extensions TO rally_owner,rally_app;
  CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;
  SET LOCAL ROLE rally_owner;SET LOCAL search_path TO rally_private,extensions;
  CREATE TABLE IF NOT EXISTS schema_migrations(version text PRIMARY KEY);
  ${migrations.join('\n')}
  DO $grant$ DECLARE t record;BEGIN FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='rally_private' LOOP
   EXECUTE format('REVOKE ALL ON TABLE rally_private.%I FROM PUBLIC,anon,authenticated,service_role',t.tablename);
   IF t.tablename IN ('schema_migrations','private_text_retention_policy') THEN
    EXECUTE format('GRANT SELECT ON TABLE rally_private.%I TO rally_app',t.tablename);
    IF t.tablename='private_text_retention_policy' THEN
     REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON rally_private.private_text_retention_policy FROM rally_app;
     IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='rally_private' AND tablename=t.tablename AND policyname='rally_policy_read') THEN
      CREATE POLICY rally_policy_read ON rally_private.private_text_retention_policy FOR SELECT TO rally_app USING (true);
     END IF;
    END IF;
   ELSE
    IF t.tablename='payment_reconciliation_evidence' THEN
     GRANT SELECT,INSERT ON rally_private.payment_reconciliation_evidence TO rally_app;
     REVOKE UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON rally_private.payment_reconciliation_evidence FROM rally_app;
    ELSE
     EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE rally_private.%I TO rally_app',t.tablename);
    END IF;
    EXECUTE format('ALTER TABLE rally_private.%I ENABLE ROW LEVEL SECURITY',t.tablename);
    IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='rally_private' AND tablename=t.tablename AND policyname='rally_server') THEN EXECUTE format('CREATE POLICY rally_server ON rally_private.%I FOR ALL TO rally_app USING (true) WITH CHECK (true)',t.tablename);END IF;
   END IF;
  END LOOP;END $grant$;
  GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA rally_private TO rally_app;
  GRANT EXECUTE ON FUNCTION rally_private.purge_expired_private_text(integer) TO rally_app;
  COMMIT;`);
 const poolers=await request('/config/database/pooler'),primary=poolers.find((p:{database_type:string})=>p.database_type==='PRIMARY');
 const connection=new URL(primary.connection_string);
 connection.username=`rally_app.${ref}`;connection.password=saved.password;connection.port='5432';
 connection.search='?sslmode=verify-full&sslrootcert=certs/supabase-ca.crt';
 try {if(((await stat('.env.hosted')).mode&0o777)!==0o600)throw new Error('PRIVATE_OUTPUT_MODE_REQUIRED');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
 await writeFile('.env.hosted',`DATABASE_URL=${connection.toString()}\n`,{mode:0o600});
 console.log('Hosted migrations and restricted runtime access ready; connection saved in ignored .env.hosted.');
}
try {await run();}catch(e){console.error(e instanceof Error?e.message:'HOSTED_SETUP_FAILED');process.exitCode=1;}
