import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {database,localDatabaseUrl} from '../src/db.ts';
import {RequestLimiter,RateLimitError,requestPolicies,rateLimitKey,subjectDigest,purgeRequestLimits} from '../src/web/rate-limits.ts';
import {errorResponse} from '../src/web/security.ts';
const schema=`limits_test_${randomUUID().replaceAll('-','')}`,base=process.env.TEST_DATABASE_URL??localDatabaseUrl,admin=database(base);
const url=new URL(base);url.searchParams.set('options',`-c search_path=${schema},public`);
const first=database(url.toString()),second=database(url.toString()),key='a'.repeat(64),a=new RequestLimiter(first,key),b=new RequestLimiter(second,key);
const up=await readFile(new URL('../db/009_request_limits.sql',import.meta.url),'utf8');
before(async()=>{await admin.query(`CREATE SCHEMA ${schema}`);await first.query(up);});
after(async()=>{await first.end();await second.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();});
test('shared quotas admit exactly the available slots under independent concurrent connections',async()=>{
 const subject=randomUUID(),total=80,limit=requestPolicies.ACTOR_WRITE.limit;
 const results=await Promise.allSettled(Array.from({length:total},(_,i)=>(i%2?a:b).reserve('ACTOR_WRITE',subject)));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,limit);
 const denied=results.filter(r=>r.status==='rejected');assert.equal(denied.length,total-limit);
 for(const r of denied)assert.ok(r.status==='rejected'&&r.reason instanceof RateLimitError&&r.reason.retryAfter>=1&&r.reason.retryAfter<=60);
 const row=(await first.query('SELECT hits FROM request_limits WHERE scope=$1 AND subject_digest=$2',['ACTOR_WRITE',subjectDigest(key,'ACTOR_WRITE',subject)])).rows[0];assert.equal(row.hits,limit);
});
test('quota survives a new pool; denial preserves expiry; another subject and read policy remain independent',async()=>{
 const subject=randomUUID(),digest=subjectDigest(key,'EMAIL_ACCOUNT',subject);
 for(let i=0;i<3;i++)await a.reserve('EMAIL_ACCOUNT',subject);
 const before=(await first.query('SELECT hits,expires_at FROM request_limits WHERE scope=$1 AND subject_digest=$2',['EMAIL_ACCOUNT',digest])).rows[0];
 const restarted=database(url.toString());try{await assert.rejects(new RequestLimiter(restarted,key).reserve('EMAIL_ACCOUNT',subject),RateLimitError);}finally{await restarted.end();}
 const later=(await first.query('SELECT hits,expires_at FROM request_limits WHERE scope=$1 AND subject_digest=$2',['EMAIL_ACCOUNT',digest])).rows[0];assert.deepEqual(later,before);
 await a.reserve('EMAIL_ACCOUNT',randomUUID());await a.reserve('ACTOR_READ',subject);
});
test('database expiry resets to one; expired cleanup is bounded and retains active counters',async()=>{
 const subject=randomUUID(),digest=subjectDigest(key,'EMAIL_ACCOUNT',subject);
 for(let i=0;i<3;i++)await a.reserve('EMAIL_ACCOUNT',subject);
 await first.query("UPDATE request_limits SET expires_at=clock_timestamp()-interval '1 second' WHERE scope=$1 AND subject_digest=$2",['EMAIL_ACCOUNT',digest]);
 await b.reserve('EMAIL_ACCOUNT',subject);
 assert.equal((await first.query('SELECT hits FROM request_limits WHERE scope=$1 AND subject_digest=$2',['EMAIL_ACCOUNT',digest])).rows[0].hits,1);
 await first.query("INSERT INTO request_limits SELECT 'PUBLIC_API',md5(n::text)||md5((n+12345)::text),1,clock_timestamp()-interval '1 hour' FROM generate_series(1,1005) n");
 assert.equal(await purgeRequestLimits(first),1000);assert.equal(await purgeRequestLimits(second),5);
 assert.equal((await first.query('SELECT hits FROM request_limits WHERE scope=$1 AND subject_digest=$2',['EMAIL_ACCOUNT',digest])).rows[0].hits,1);
});
test('account identifiers use a stable keyed digest and quota responses disclose no identity',async()=>{
 const email='synthetic-person@example.invalid',subject=subjectDigest(key,'EMAIL_ACCOUNT',email);
 await a.reserve('EMAIL_ACCOUNT',email);
 const rows=(await first.query('SELECT * FROM request_limits WHERE subject_digest=$1',[subject])).rows;assert.equal(rows.length,1);assert.ok(!JSON.stringify(rows).includes(email));
 assert.equal(subject,subjectDigest(key,'EMAIL_ACCOUNT',email));assert.notEqual(subject,subjectDigest('b'.repeat(64),'EMAIL_ACCOUNT',email));assert.notEqual(subject,subjectDigest(key,'ACTOR_READ',email));
 for(const bad of [undefined,'', 'short','A'.repeat(64)])assert.throws(()=>rateLimitKey(bad??''),/SETUP_REQUIRED/);
 const response=errorResponse(new RateLimitError(18));assert.equal(response.status,429);assert.equal(response.headers.get('Retry-After'),'18');assert.equal(response.headers.get('Cache-Control'),'no-store');assert.deepEqual(await response.json(),{error:'REQUEST_LIMIT'});
});
test('schema rollback and reapply run only in a separate empty schema',async()=>{
 const disposable=`limits_migration_${randomUUID().replaceAll('-','')}`;await admin.query(`CREATE SCHEMA ${disposable}`);
 const location=new URL(base);location.searchParams.set('options',`-c search_path=${disposable},public`);const pool=database(location.toString());
 try{await pool.query(up);await pool.query(await readFile(new URL('../db/009_request_limits.down.sql',import.meta.url),'utf8'));await pool.query(up);
  assert.equal((await pool.query('SELECT count(*) FROM request_limits')).rows[0].count,'0');
 }finally{await pool.end();await admin.query(`DROP SCHEMA ${disposable} CASCADE`);}
});
test('database failure fails closed instead of dispatching a protected external action',async()=>{
 const missing=new URL(base);missing.searchParams.set('options',`-c search_path=missing_limits_${randomUUID().replaceAll('-','')}`);const pool=database(missing.toString());let dispatches=0;
 try{await assert.rejects((async()=>{await new RequestLimiter(pool,key).reserve('MODEL_GLOBAL','application');dispatches++;})());assert.equal(dispatches,0);}finally{await pool.end();}
});
