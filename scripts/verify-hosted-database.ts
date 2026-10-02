import {writeFile,readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {database} from '../src/db.ts';
import {migrationVersions} from '../src/migrations.ts';
const connection=new URL(process.env.DATABASE_URL??'');
if(connection.searchParams.get('sslmode')!=='verify-full'||connection.searchParams.get('sslrootcert')!=='certs/supabase-ca.crt')throw new Error('VERIFIED_TLS_CONFIGURATION_REQUIRED');
const pool=database();
try {
 const c=await pool.connect();
 try{
  const meta=(await c.query(`SELECT current_user,current_schema(),(SELECT count(*)::int FROM schema_migrations) AS migrations,(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS ssl,has_schema_privilege(current_user,'rally_private','CREATE') AS schema_create,has_table_privilege(current_user,(SELECT t.oid FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='auth' AND t.relname='users'),'SELECT') AS auth_users_read,(SELECT rolsuper OR rolcreaterole OR rolcreatedb OR rolbypassrls FROM pg_roles WHERE rolname=current_user) AS elevated`)).rows[0];
  const socket=(c as unknown as {connection:{stream:{encrypted?:boolean;authorized?:boolean}}}).connection.stream;const clientTls=socket.encrypted===true&&socket.authorized===true;
  if(!clientTls)throw new Error('CLIENT_TLS_NOT_VERIFIED');
  if(meta.current_user!=='rally_app'||meta.current_schema!=='rally_private'||meta.migrations!==migrationVersions.length||meta.schema_create||meta.auth_users_read||meta.elevated)throw new Error('ROLE_AUDIT_FAILED');
  const versions=(await c.query('SELECT version FROM schema_migrations ORDER BY version')).rows.map(r=>r.version);
  if(JSON.stringify(versions)!==JSON.stringify([...migrationVersions].sort()))throw new Error('MIGRATION_SET_MISMATCH');
  const id=randomUUID();await c.query('BEGIN');
  await c.query('INSERT INTO planning_groups(id,organizer_id,invite_digest,target_size,catalog) VALUES($1,$2,$3,1,$4)',[id,randomUUID(),'hosted-rollback-probe',await readFile('fixtures/studio.json','utf8')]);
  if((await c.query('SELECT id FROM planning_groups WHERE id=$1',[id])).rowCount!==1)throw new Error('WRITE_PROBE_FAILED');
  await c.query('ROLLBACK');if((await c.query('SELECT id FROM planning_groups WHERE id=$1',[id])).rowCount!==0)throw new Error('ROLLBACK_PROBE_FAILED');
  const browserRoles=(await c.query(`SELECT has_schema_privilege('anon','rally_private','USAGE') AS anon_usage,has_schema_privilege('authenticated','rally_private','USAGE') AS authenticated_usage`)).rows[0];
  if(browserRoles.anon_usage||browserRoles.authenticated_usage)throw new Error('BROWSER_ROLE_ACCESS');
  const env=process.env;if(!env.SUPABASE_URL||!env.SUPABASE_PUBLISHABLE_KEY)throw new Error('BROWSER_API_AUDIT_CONFIGURATION_REQUIRED');const response=await fetch(env.SUPABASE_URL+'/rest/v1/planning_groups?select=id&limit=1',{headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY,'Accept-Profile':'rally_private'}});
  if(response.status!==406)throw new Error('PRIVATE_SCHEMA_API_AUDIT_'+response.status);
  await writeFile('evidence/hosted-database.json',JSON.stringify({observedAt:new Date().toISOString(),scope:'Actual existing Rally Supabase Postgres; restricted server role over certificate-verified TLS using session pooler. Synthetic write rolled back; no production customer or payment data moved.',serverRole:meta.current_user,schema:meta.current_schema,migrations:meta.migrations,clientToPoolerTls:true,providerPoolerToDatabaseTls:meta.ssl,certificateVerification:'sslmode=verify-full',runtimeCanCreateSchema:meta.schema_create,runtimeCanReadAuthUsers:meta.auth_users_read,runtimeElevated:meta.elevated,browserRolesCanUseSchema:false,privateSchemaRestHttp:response.status,writeAndRollbackVerified:true,applicationDeployed:false},null,2)+'\n');
  console.log('Hosted database connection, restricted role, private-schema boundary and rollback verified.');
 }finally{c.release();}
} catch(e){console.log(JSON.stringify({stage:'HOSTED_CONNECTION_AUDIT',code:(e as {code?:string})?.code??(e instanceof Error?e.message:'FAILED')}));process.exitCode=1;}finally{await pool.end();}
