import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {database} from '../src/db.ts';
import {subjectDigest,requestPolicies} from '../src/web/rate-limits.ts';
async function run(){
 const dbUrl=new URL(process.env.DATABASE_URL??'');if(!['127.0.0.1','localhost'].includes(dbUrl.hostname)||process.env.APP_ORIGIN!=='http://localhost:3000')throw new Error('LOCAL_DEVELOPMENT_ONLY');
 const pool=database(),digest=subjectDigest(process.env.RALLY_RATE_LIMIT_KEY!,'PUBLIC_API','application');
 const previous=(await pool.query('SELECT hits,expires_at FROM request_limits WHERE scope=$1 AND subject_digest=$2',['PUBLIC_API',digest])).rows[0];
 const observations:unknown[]=[];
 try{
  await pool.query(`INSERT INTO request_limits VALUES('PUBLIC_API',$1,$2,clock_timestamp()+interval '1 hour') ON CONFLICT(scope,subject_digest) DO UPDATE SET hits=excluded.hits,expires_at=excluded.expires_at`,[digest,requestPolicies.PUBLIC_API.limit]);
  const paths=['/api/auth/session','/api/groups/00000000-0000-4000-8000-000000000001','/api/groups/00000000-0000-4000-8000-000000000001/clarification','/api/offers/00000000-0000-4000-8000-000000000001','/api/studio/bookings','/api/studio/requests','/api/studio/requests/00000000-0000-4000-8000-000000000001','/auth/callback'];
  for(const path of paths){const r=await fetch('http://localhost:3000'+path,{redirect:'manual',headers:{'X-Forwarded-For':`198.51.100.${observations.length+1}`}});assert.equal(r.status,429);assert.deepEqual(await r.json(),{error:'REQUEST_LIMIT'});assert.ok(Number(r.headers.get('Retry-After'))>0);assert.match(r.headers.get('Cache-Control')??'',/no-store/);observations.push({path,status:r.status,retryAfterPresent:true,forwardedHeaderDidNotBypass:true});}
  for(const path of ['/api/auth/start','/api/auth/signout','/api/groups','/api/groups/join']){const r=await fetch('http://localhost:3000'+path,{method:'POST',headers:{Origin:'http://localhost:3000','Content-Type':'application/json'},body:JSON.stringify({email:'synthetic-account@example.invalid'})});assert.equal(r.status,429);observations.push({path,method:'POST',status:r.status});}
  const foreign=await fetch('http://localhost:3000/api/auth/start',{method:'POST',headers:{Origin:'https://foreign.invalid','Content-Type':'application/json'},body:'{}'});assert.equal(foreign.status,403);
  const health=await fetch('http://localhost:3000/api/health');assert.equal(health.status,200);
 }finally{
  if(previous)await pool.query('UPDATE request_limits SET hits=$3,expires_at=$4 WHERE scope=$1 AND subject_digest=$2',['PUBLIC_API',digest,previous.hits,previous.expires_at]);else await pool.query('DELETE FROM request_limits WHERE scope=$1 AND subject_digest=$2',['PUBLIC_API',digest]);
  await pool.end();
 }
 const session=await fetch('http://localhost:3000/api/auth/session');assert.equal(session.status,200);assert.deepEqual(await session.json(),{signedIn:false});
 await writeFile('evidence/web/request-limits.json',JSON.stringify({observedAt:new Date().toISOString(),scope:'Actual local Next.js HTTP and PostgreSQL. Temporarily seeded global quota exhausted, then original quota restored. No provider email or model dispatch; no managed participant or deployed rate-limit proof.',observations,foreignOriginRejected:true,healthExempt:true,postRestoreAnonymousSession200:true},null,2)+'\n');
 console.log('Twelve HTTP routes reject exhausted quota; spoofed forwarding cannot bypass; original quota restored.');
}
run().catch(()=>{console.error('HTTP_QUOTA_PROBE_FAILED');process.exitCode=1;});
