import { test,before,after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { database,localDatabaseUrl } from '../src/db.ts';
import { PaymentEngine } from '../src/payments/engine.ts';
import { createSandboxOffer } from '../src/payments/fixtures.ts';
import { SimulatedProvider } from './simulated-provider.ts';

const schema = `rally_test_${randomUUID().replaceAll('-','')}`;
const admin = database(process.env.TEST_DATABASE_URL ?? localDatabaseUrl);
const url = new URL(process.env.TEST_DATABASE_URL ?? localDatabaseUrl);
url.searchParams.set('options',`-c search_path=${schema},public`);
const pool = database(url.toString());
before(async () => {
  await admin.query(`CREATE SCHEMA ${schema}`);
  await pool.query(await readFile(new URL('../db/001_payments.sql',import.meta.url),'utf8'));
});
after(async () => { await pool.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end(); });
async function setup() {
  const offer = await createSandboxOffer(pool,{merchantId:'synthetic_merchant'});
  const provider = new SimulatedProvider(), engine = new PaymentEngine(pool,provider,{reconcileDelayMs:0});
  const command = (index:number) => ({commandId:randomUUID(),offerId:offer.id,actorId:offer.members[index].userId,offerHash:offer.hash});
  async function prepare() {
    for (let i=0;i<3;i++) { await engine.accept(command(i)); await engine.step(offer.id); }
    for (let i=0;i<3;i++) { await engine.authorize(command(i)); await engine.step(offer.id); }
  }
  async function settle(max=15) { for (let i=0;i<max;i++) if (!await engine.step(offer.id)) break; }
  const state = async () => (await pool.query('SELECT state,cleanup FROM offers WHERE id=$1',[offer.id])).rows[0];
  return {offer,provider,engine,command,prepare,settle,state};
}

test('three verified authorizations settle once and retain confirmed inventory',async () => {
  const x = await setup(); await x.prepare(); await x.settle();
  assert.deepEqual(await x.state(),{state:'CONFIRMED',cleanup:'NOT_REQUIRED'});
  assert.equal(x.provider.financialEffects.captures,3);
  await x.settle(); assert.equal(x.provider.financialEffects.captures,3);
  assert.equal((await pool.query('SELECT state FROM reservations WHERE offer_id=$1',[x.offer.id])).rows[0].state,'BOOKED');
  const status = await x.engine.participantStatus(x.offer.id,x.offer.members[0].userId);
  assert.equal(status.payment,'PAYMENT_COMPLETED');
});
test('definitive failure after a capture aborts and compensates without capturing later buyers',async () => {
  const x = await setup(); await x.prepare(); x.provider.failedMembers.add(x.offer.members[1].id);
  await x.settle();
  assert.deepEqual(await x.state(),{state:'ABORTED',cleanup:'COMPLETE'});
  assert.deepEqual(x.provider.financialEffects,{captures:1,refunds:1,voids:2});
  assert.equal((await x.engine.participantStatus(x.offer.id,x.offer.members[0].userId)).payment,'REFUND_COMPLETED');
});
test('lost capture response survives engine restart without a duplicate charge',async () => {
  const x = await setup(); await x.prepare(); x.provider.lostResponses.add('CAPTURE');
  await x.engine.step(x.offer.id);
  assert.equal((await x.engine.participantStatus(x.offer.id,x.offer.members[0].userId)).payment,'CHECKING_PAYMENT');
  const restarted = new PaymentEngine(pool,x.provider,{reconcileDelayMs:0});
  for (let i=0;i<10;i++) if (!await restarted.step(x.offer.id)) break;
  assert.equal((await x.state()).state,'CONFIRMED'); assert.equal(x.provider.financialEffects.captures,3);
});
test('pending capture blocks subsequent captures and becomes refund work after deadline',async () => {
  const x = await setup(); await x.prepare(); x.provider.pendingKinds.add('CAPTURE');
  await x.engine.step(x.offer.id); await x.engine.step(x.offer.id);
  assert.equal(x.provider.calls.filter(o => o.kind === 'CAPTURE').length,1);
  await pool.query("UPDATE offers SET opened_at=clock_timestamp()-interval '3 hours',deadline=clock_timestamp()-interval '2 hours',reservation_end=clock_timestamp()-interval '1 second' WHERE id=$1",[x.offer.id]);
  await x.engine.step(x.offer.id);
  assert.equal((await x.state()).state,'ABORTED'); assert.notEqual((await x.state()).cleanup,'COMPLETE');
  const captureOp = x.provider.calls.find(o => o.kind === 'CAPTURE')!;
  x.provider.results.set(captureOp.request_id,{outcome:'success',id:'late_capture',status:'COMPLETED'});
  x.provider.pendingKinds.clear(); await x.settle();
  assert.deepEqual(await x.state(),{state:'ABORTED',cleanup:'COMPLETE'}); assert.equal(x.provider.financialEffects.refunds,1);
});
test('withdrawal before the final authorization cancels and voids late authorization',async () => {
  const x = await setup();
  for (let i=0;i<3;i++) { await x.engine.accept(x.command(i)); await x.engine.step(x.offer.id); }
  for (let i=0;i<2;i++) { await x.engine.authorize(x.command(i)); await x.engine.step(x.offer.id); }
  await x.engine.authorize(x.command(2));
  const original = x.provider.execute.bind(x.provider);
  let entered!:()=>void, release!:()=>void;
  const arrived = new Promise<void>(r=>entered=r), barrier = new Promise<void>(r=>release=r);
  x.provider.execute = async op => { if (op.kind === 'AUTHORIZE') {entered();await barrier;} return original(op); };
  const running = x.engine.step(x.offer.id); await arrived;
  await x.engine.withdraw(x.command(0)); release(); await running; await x.settle();
  assert.deepEqual(await x.state(),{state:'WITHDRAWN',cleanup:'COMPLETE'});
  assert.deepEqual(x.provider.financialEffects,{captures:0,refunds:0,voids:3});
});
test('settlement claim wins against later ordinary withdrawal',async () => {
  const x = await setup(); await x.prepare();
  await assert.rejects(x.engine.withdraw(x.command(0)),{code:'CANCELLATION_REVIEW_REQUIRED'});
  await x.settle(); assert.equal((await x.state()).state,'CONFIRMED');
});
test('repeated acceptance has one order and command-ID conflicts are rejected',async () => {
  const x = await setup(), input = x.command(0);
  const results = await Promise.all([x.engine.accept(input),x.engine.accept(input)]);
  assert.deepEqual(results[0],results[1]);
  await assert.rejects(x.engine.accept({...input,actorId:x.offer.members[1].userId}),{code:'COMMAND_CONFLICT'});
  await x.engine.step(x.offer.id);
  assert.equal(x.provider.calls.filter(o=>o.kind === 'CREATE_ORDER').length,1);
});
test('unknown capture beyond replay retention stays visible and never gains a fresh request ID',async () => {
  const x = await setup(); await x.prepare(); x.provider.lostResponses.add('CAPTURE'); await x.engine.step(x.offer.id);
  x.provider.observe = async () => null;
  await pool.query("UPDATE payment_operations SET retry_until=clock_timestamp()-interval '1 second' WHERE offer_id=$1 AND kind='CAPTURE'",[x.offer.id]);
  await x.engine.step(x.offer.id);
  assert.equal((await pool.query("SELECT state FROM payment_operations WHERE offer_id=$1 AND kind='CAPTURE'",[x.offer.id])).rows[0].state,'ACTION_REQUIRED');
  assert.equal(x.provider.financialEffects.captures,1); assert.equal((await x.state()).state,'SETTLING');
});
test('concurrent workers cannot dispatch the same financial operation twice',async () => {
  const x = await setup(); await x.prepare();
  await Promise.all(Array.from({length:6},()=>x.engine.step(x.offer.id))); await x.settle();
  assert.equal(x.provider.financialEffects.captures,3);
  assert.equal(new Set(x.provider.calls.filter(o=>o.kind === 'CAPTURE').map(o=>o.request_id)).size,3);
});
test('expired worker lease cannot overwrite a newer verified capture result',async () => {
  const x=await setup();await x.prepare();
  const original=x.provider.execute.bind(x.provider);
  let entered!:()=>void,release!:()=>void;
  const arrived=new Promise<void>(r=>entered=r),barrier=new Promise<void>(r=>release=r);
  x.provider.execute=async op=>{
    const result=await original(op);
    if(op.kind==='CAPTURE' && op.member_id===x.offer.members[0].id) {entered();await barrier;return {...result,outcome:'pending',status:'PENDING'};}
    return result;
  };
  const stale=x.engine.step(x.offer.id);await arrived;
  await pool.query("UPDATE payment_operations SET lease_until=clock_timestamp()-interval '1 second' WHERE offer_id=$1 AND kind='CAPTURE'",[x.offer.id]);
  await x.engine.step(x.offer.id);release();await stale;
  const verified=(await pool.query("SELECT state FROM payment_operations WHERE member_id=$1 AND kind='CAPTURE'",[x.offer.members[0].id])).rows[0];
  assert.equal(verified.state,'SUCCEEDED');
  await x.settle();
  assert.equal((await x.state()).state,'CONFIRMED');assert.equal(x.provider.financialEffects.captures,3);
});
test('uncertain capture does not block voiding other buyers after booking aborts',async () => {
  const x=await setup();await x.prepare();x.provider.pendingKinds.add('CAPTURE');
  const engine=new PaymentEngine(pool,x.provider);
  await engine.step(x.offer.id);
  await pool.query("UPDATE offers SET opened_at=clock_timestamp()-interval '3 hours',deadline=clock_timestamp()-interval '2 hours',reservation_end=clock_timestamp()-interval '1 second' WHERE id=$1",[x.offer.id]);
  await engine.step(x.offer.id);await engine.step(x.offer.id);
  assert.equal((await x.state()).state,'ABORTED');assert.notEqual((await x.state()).cleanup,'COMPLETE');
  assert.equal(x.provider.financialEffects.voids,2);
  assert.equal(x.provider.financialEffects.refunds,0);
});
test('object-level ownership, changed offer and hostile amount input are rejected',async () => {
  const x = await setup();
  await assert.rejects(x.engine.accept({...x.command(0),actorId:randomUUID()}),{code:'NOT_A_MEMBER'});
  await assert.rejects(x.engine.participantStatus(x.offer.id,randomUUID()),{code:'NOT_A_MEMBER'});
  await assert.rejects(x.engine.accept({...x.command(0),offerHash:'a'.repeat(64)}),{code:'STALE_OFFER'});
  await assert.rejects(x.engine.accept({...x.command(0),amountMinor:1}));
  assert.equal(x.provider.calls.length,0);
});
test('PostgreSQL exclusion constraint gives one winner to simultaneous overlapping reservations',async () => {
  const resourceId = `exclusive-${randomUUID()}`;
  const results = await Promise.allSettled([createSandboxOffer(pool,{merchantId:'synthetic_merchant',resourceId}),createSandboxOffer(pool,{merchantId:'synthetic_merchant',resourceId})]);
  assert.equal(results.filter(r=>r.status === 'fulfilled').length,1);
  const rejected = results.find(r=>r.status === 'rejected') as PromiseRejectedResult;
  assert.ok(['23P01','40P01'].includes(rejected.reason.code));
  assert.equal(Number((await pool.query('SELECT count(*) FROM reservations WHERE resource_id=$1',[resourceId])).rows[0].count),1);
});
test('a missing authorization at deadline expires without capturing any buyer',async () => {
  const x = await setup(); await x.engine.accept(x.command(0)); await x.engine.step(x.offer.id);
  await x.engine.authorize(x.command(0)); await x.engine.step(x.offer.id);
  await pool.query("UPDATE offers SET opened_at=clock_timestamp()-interval '3 hours',deadline=clock_timestamp()-interval '2 hours' WHERE id=$1",[x.offer.id]);
  await x.settle(); assert.deepEqual(await x.state(),{state:'EXPIRED',cleanup:'COMPLETE'});
  assert.equal(x.provider.financialEffects.captures,0);assert.equal(x.provider.financialEffects.voids,1);
});
test('a duplicate sandbox buyer aborts while retaining both authorization IDs for cleanup',async () => {
  const x = await setup(); x.provider.payerOverride='one_buyer';
  for (let i=0;i<3;i++) {await x.engine.accept(x.command(i));await x.engine.step(x.offer.id);}
  await x.engine.authorize(x.command(0));await x.engine.step(x.offer.id);
  await x.engine.authorize(x.command(1));await x.engine.step(x.offer.id);await x.settle();
  assert.deepEqual(await x.state(),{state:'ABORTED',cleanup:'COMPLETE'});
  assert.equal(x.provider.financialEffects.captures,0);assert.equal(x.provider.financialEffects.voids,2);
});
test('verified webhooks deduplicate and schedule reconciliation without trusting success claims',async () => {
  const x=await setup();await x.prepare();x.provider.lostResponses.add('CAPTURE');await x.engine.step(x.offer.id);
  x.provider.verifyWebhook=async()=>true;
  const op=x.provider.calls.find(o=>o.kind==='CAPTURE')!;
  const event={id:'webhook_'+randomUUID(),event_type:'PAYMENT.CAPTURE.COMPLETED',resource:{id:'webhook_capture',invoice_id:op.id,status:'COMPLETED'}};
  assert.deepEqual(await x.engine.webhook({},event),{duplicate:false});assert.deepEqual(await x.engine.webhook({},event),{duplicate:true});
  const stored=(await pool.query('SELECT state,provider_id FROM payment_operations WHERE id=$1',[op.id])).rows[0];
  assert.equal(stored.state,'UNKNOWN');assert.equal(stored.provider_id,'webhook_capture');
});
test('unverified webhook cannot change financial state',async () => {
  const x=await setup();x.provider.verifyWebhook=async()=>false;
  await assert.rejects(x.engine.webhook({},{id:'attack',event_type:'PAYMENT.CAPTURE.COMPLETED',resource:{id:'fake'}}),{code:'INVALID_WEBHOOK_SIGNATURE'});
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM provider_webhooks WHERE event_id=$1',['attack'])).rows[0].count,0);
});
test('migration down and up succeeds in an isolated empty schema',async () => {
  const name = `rally_migration_${randomUUID().replaceAll('-','')}`;
  const client = await admin.connect();
  try {
    await client.query(`CREATE SCHEMA ${name}`); await client.query(`SET search_path TO ${name},public`);
    await client.query(await readFile(new URL('../db/001_payments.sql',import.meta.url),'utf8'));
    await client.query(await readFile(new URL('../db/001_payments.down.sql',import.meta.url),'utf8'));
    await client.query(await readFile(new URL('../db/001_payments.sql',import.meta.url),'utf8'));
    assert.equal((await client.query("SELECT count(*)::int AS count FROM offers")).rows[0].count,0);
  } finally { await client.query('SET search_path TO public');await client.query(`DROP SCHEMA IF EXISTS ${name} CASCADE`);client.release(); }
});
