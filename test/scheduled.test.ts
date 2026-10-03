import {test,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import type pg from 'pg';
import {database,localDatabaseUrl} from '../src/db.ts';
import {migrationVersions} from '../src/migrations.ts';
import {PaymentEngine} from '../src/payments/engine.ts';
import {createSandboxOffer} from '../src/payments/fixtures.ts';
import {authorizeSettlementTrigger,scheduledSettlement} from '../src/payments/scheduled.ts';
import {SimulatedProvider} from './simulated-provider.ts';

// Real isolated PostgreSQL, simulated provider. No hosted scheduler or PayPal claim.
let admin:pg.Pool,pool:pg.Pool,peer:pg.Pool,schema:string;
beforeEach(async()=>{
 schema=`scheduled_test_${randomUUID().replaceAll('-','')}`;const base=process.env.TEST_DATABASE_URL??localDatabaseUrl;
 admin=database(base);await admin.query(`CREATE SCHEMA ${schema}`);const url=new URL(base);url.searchParams.set('options',`-c search_path=${schema},public`);
 pool=database(url.toString());peer=database(url.toString());for(const v of migrationVersions)await pool.query(await readFile(new URL(`../db/${v}.sql`,import.meta.url),'utf8'));
});
afterEach(async()=>{await pool.end();await peer.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();});
async function fixture(){
 const offer=await createSandboxOffer(pool,{merchantId:'synthetic_merchant'}),provider=new SimulatedProvider(),engine=new PaymentEngine(pool,provider,{reconcileDelayMs:0});
 const command=(i:number)=>({commandId:randomUUID(),offerId:offer.id,actorId:offer.members[i].userId,offerHash:offer.hash});
 const state=async()=>(await pool.query('SELECT state,cleanup FROM offers WHERE id=$1',[offer.id])).rows[0];
 const prepare=async()=>{for(let i=0;i<3;i++){await engine.accept(command(i));await engine.step(offer.id);}for(let i=0;i<3;i++){await engine.authorize(command(i));await engine.step(offer.id);}};
 return {offer,provider,engine,command,state,prepare};
}
test('scheduled payment entry requires explicit mode and exact private Bearer key',()=>{
 const key='a'.repeat(64),request=(value?:string)=>new Request('https://rally.example/api/internal/settlement',{method:'POST',headers:value?{Authorization:value}:{}});
 assert.doesNotThrow(()=>authorizeSettlementTrigger(request(`Bearer ${key}`),'scheduled',key));
 for(const value of [undefined,key,`Bearer ${'b'.repeat(64)}`,`bearer ${key}`,'x'.repeat(257)])assert.throws(()=>authorizeSettlementTrigger(request(value),'scheduled',key),/REQUEST_NOT_ALLOWED/);
 assert.throws(()=>authorizeSettlementTrigger(request(`Bearer ${key}`),'worker',key),/SETTLEMENT_UNAVAILABLE/);
 assert.throws(()=>authorizeSettlementTrigger(request(`Bearer ${key}`),'scheduled','short'),/SETTLEMENT_UNAVAILABLE/);
});
test('idle runs make no provider calls and deadline processing expires an untouched offer',async()=>{
 const x=await fixture();assert.deepEqual(await scheduledSettlement(pool,x.engine),{state:'IDLE',steps:0,failures:0});assert.equal(x.provider.calls.length,0);
 await pool.query("UPDATE offers SET opened_at=clock_timestamp()-interval '3 hours',deadline=clock_timestamp()-interval '1 hour',reservation_end=clock_timestamp()+interval '1 hour' WHERE id=$1",[x.offer.id]);
 assert.deepEqual(await scheduledSettlement(pool,x.engine),{state:'PROCESSED',steps:0,failures:0});assert.deepEqual(await x.state(),{state:'EXPIRED',cleanup:'COMPLETE'});
});
test('a bounded run leaves undispatched work for the next invocation',async()=>{
 const provider=new SimulatedProvider(),engine=new PaymentEngine(pool,provider,{reconcileDelayMs:0});
 for(let i=0;i<3;i++){const x=await fixture();await engine.accept(x.command(0));}
 assert.equal((await scheduledSettlement(pool,engine,{maxSteps:2})).steps,2);assert.equal(provider.calls.length,2);
 assert.equal((await pool.query("SELECT count(*) FROM payment_operations WHERE state='PLANNED'")).rows[0].count,'1');
 assert.equal((await scheduledSettlement(peer,new PaymentEngine(peer,provider))).steps,1);assert.equal(provider.calls.length,3);
});
test('overlapping scheduler requests across pools cannot dispatch in parallel and release the lock',async()=>{
 const x=await fixture();await x.engine.accept(x.command(0));let enter!:()=>void,release!:()=>void;
 const entered=new Promise<void>(r=>enter=r),barrier=new Promise<void>(r=>release=r),execute=x.provider.execute.bind(x.provider);
 x.provider.execute=async op=>{enter();await barrier;return execute(op);};
 const running=scheduledSettlement(pool,x.engine);await entered;
 assert.deepEqual(await scheduledSettlement(peer,new PaymentEngine(peer,x.provider)),{state:'BUSY',steps:0,failures:0});
 release();assert.equal((await running).steps,1);assert.equal(x.provider.calls.length,1);
 assert.deepEqual(await scheduledSettlement(peer,x.engine),{state:'IDLE',steps:0,failures:0});
});
test('separate invocations reconcile a lost capture response and confirm only verified totals',async()=>{
 const x=await fixture();await x.prepare();x.provider.lostResponses.add('CAPTURE');
 await scheduledSettlement(pool,x.engine);assert.equal((await x.state()).state,'SETTLING');
 assert.equal((await x.engine.participantStatus(x.offer.id,x.offer.members[0].userId)).payment,'CHECKING_PAYMENT');
 const restarted=new PaymentEngine(peer,x.provider,{reconcileDelayMs:0});
 for(let i=0;i<10;i++)await scheduledSettlement(peer,restarted);
 assert.deepEqual(await x.state(),{state:'CONFIRMED',cleanup:'NOT_REQUIRED'});assert.equal(x.provider.financialEffects.captures,3);
 assert.equal(new Set(x.provider.calls.filter(c=>c.kind==='CAPTURE').map(c=>c.request_id)).size,3);
});
test('scheduled processing compensates partial failure without depending on an open browser',async()=>{
 const x=await fixture();await x.prepare();x.provider.failedMembers.add(x.offer.members[1].id);
 for(let i=0;i<12;i++)await scheduledSettlement(i%2?peer:pool,new PaymentEngine(i%2?peer:pool,x.provider,{reconcileDelayMs:0}));
 assert.deepEqual(await x.state(),{state:'ABORTED',cleanup:'COMPLETE'});assert.deepEqual(x.provider.financialEffects,{captures:1,refunds:1,voids:2});
});
test('budget exhaustion preserves queued work and isolated step failure releases the scheduler lock',async()=>{
 const provider=new SimulatedProvider(),engine=new PaymentEngine(pool,provider);for(let i=0;i<2;i++){const x=await fixture();await engine.accept(x.command(0));}
 let times=0;assert.equal((await scheduledSettlement(pool,engine,{budgetMs:1,now:()=>times++>1?2:0})).steps,1);
 assert.equal((await pool.query("SELECT count(*) FROM payment_operations WHERE state='PLANNED'")).rows[0].count,'1');
 const failed=await scheduledSettlement(pool,{step:async()=>{throw new Error('synthetic failure');}});assert.equal(failed.failures,1);
 assert.equal((await scheduledSettlement(peer,engine)).steps,1);
});
