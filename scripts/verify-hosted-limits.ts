import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {database} from '../src/db.ts';
import {RequestLimiter,RateLimitError,rateLimitKey,subjectDigest} from '../src/web/rate-limits.ts';
const url=new URL(process.env.DATABASE_URL??'');
if(url.searchParams.get('sslmode')!=='verify-full'||url.searchParams.get('sslrootcert')!=='certs/supabase-ca.crt')throw new Error('VERIFIED_TLS_CONFIGURATION_REQUIRED');
const pool=database(),key=rateLimitKey(),subject=`synthetic-quota-probe-${randomUUID()}`,scope='EMAIL_ACCOUNT',digest=subjectDigest(key,scope,subject),limiter=new RequestLimiter(pool,key);
let report:string|undefined;
try{
 const meta=(await pool.query('SELECT current_user,current_schema()')).rows[0];assert.equal(meta.current_user,'rally_app');assert.equal(meta.current_schema,'rally_private');
 for(let n=0;n<3;n++)await limiter.reserve(scope,subject);
 await assert.rejects(limiter.reserve(scope,subject),RateLimitError);
 const row=(await pool.query('SELECT hits FROM request_limits WHERE scope=$1 AND subject_digest=$2',[scope,digest])).rows[0];assert.equal(row.hits,3);
 report=JSON.stringify({observedAt:new Date().toISOString(),scope:'Actual existing free Rally Supabase Postgres under restricted runtime role. Synthetic quota subject only; no email/model/provider call. Temporary probe row removed in finally.',role:meta.current_user,schema:meta.current_schema,admitted:3,fourthAttemptDenied:true,denialDidNotIncrement:true,tlsMode:'verify-full',applicationDeployed:false},null,2)+'\n';
}finally{try{await pool.query('DELETE FROM request_limits WHERE scope=$1 AND subject_digest=$2',[scope,digest]);}finally{await pool.end();}}
if(report){await writeFile('evidence/hosted-request-limits.json',report);console.log('Hosted restricted role admitted three quota reservations and denied the fourth; probe row removed.');}
