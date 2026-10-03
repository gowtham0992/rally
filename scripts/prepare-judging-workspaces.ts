import {readFile,stat,writeFile} from 'node:fs/promises';
import {z} from 'zod';
import {database} from '../src/db.ts';
import {catalogSchema} from '../src/planning/domain.ts';
import {judgingCatalog,judgingAccessEnd,JudgingPreparation} from '../src/demo/judging.ts';
async function run(){
 if(process.env.ENABLE_JUDGING_PREPARATION!=='true')throw new Error('EXPLICIT_JUDGING_PREPARATION_REQUIRED');
 const checkpoint='evidence/private/demo-provision-checkpoint.json';
 if(((await stat(checkpoint)).mode&0o777)!==0o600)throw new Error('PRIVATE_CHECKPOINT_MODE_REQUIRED');
 const saved=z.object({ref:z.string(),workspaceIds:z.array(z.uuid()).length(5)}).parse(JSON.parse(await readFile(checkpoint,'utf8')));
 const url=new URL(process.env.SUPABASE_URL??'');
 if(url.protocol!=='https:'||url.hostname!==`${saved.ref}.supabase.co`)throw new Error('JUDGING_PROJECT_CHECKPOINT_MISMATCH');
 const connection=new URL(process.env.DATABASE_URL??'');
 if(connection.searchParams.get('sslmode')!=='verify-full'||connection.searchParams.get('sslrootcert')!=='certs/supabase-ca.crt')throw new Error('VERIFIED_TLS_CONFIGURATION_REQUIRED');
 const fixture=catalogSchema.parse(JSON.parse(await readFile('fixtures/studio.json','utf8'))),replacement=judgingCatalog(fixture),pool=database();
 try{
  const audit=(await pool.query('SELECT current_user,current_schema()')).rows[0];
  if(audit.current_user!=='rally_app'||audit.current_schema!=='rally_private')throw new Error('JUDGING_RUNTIME_ROLE_REQUIRED');
  const preparation=new JudgingPreparation(pool,fixture,replacement),apply=process.argv.includes('--apply'),results=await preparation.run(saved.workspaceIds,apply);
  const report={observedAt:new Date().toISOString(),applied:apply,scope:'Existing five synthetic workspaces only. Unclaimed pristine groups receive a new catalog and planning group; prior catalogs, groups and preference history are retained. Leased workspaces are preserved.',workspaces:results.length,refreshed:results.filter(r=>r.status==='RELEASED').length,alreadyReleased:results.filter(r=>r.status==='ALREADY_RELEASED').length,leasedPreserved:results.filter(r=>r.status==='LEASE_PRESERVED').length,slots:replacement.slots,requiredNewLeaseEnd:judgingAccessEnd,authAccountsCreated:0,emailsSent:0,paymentsInitiated:0,consentsRecorded:0};
  if(apply)await writeFile('evidence/judging-workspace-preparation.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report));
 }finally{await pool.end();}
}
try{await run();}catch(e){const code=e instanceof Error?e.message:'';console.error(/^[A-Z][A-Z_0-9]+$/.test(code)?code:'JUDGING_PREPARATION_FAILED');process.exitCode=1;}
