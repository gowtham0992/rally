import {test,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import type pg from 'pg';
import {database,localDatabaseUrl,transaction} from '../src/db.ts';
import {migrationVersions} from '../src/migrations.ts';
import {purgeExpiredPrivateText} from '../src/intake/retention.ts';
import {IntakeService} from '../src/intake/service.ts';
import {ClarificationService} from '../src/intake/clarifications.ts';
import {confirmedPlan} from '../src/planning/persisted.ts';
import {fingerprint} from '../src/payments/types.ts';
import {createSandboxOffer} from '../src/payments/fixtures.ts';
import {PaymentEngine} from '../src/payments/engine.ts';
import {SimulatedProvider} from './simulated-provider.ts';
let schema:string,admin:pg.Pool,pool:pg.Pool,peer:pg.Pool;
const note='I can collect next week.',catalog=JSON.parse(await readFile(new URL('../fixtures/studio.json',import.meta.url),'utf8'));
// This isolated retention fixture uses two friends and an explicitly two-person studio.
for(const offering of catalog.offerings)offering.minPeople=2;
const up=await readFile(new URL('../db/012_private_text_retention.sql',import.meta.url),'utf8');
beforeEach(async()=>{
 schema=`retention_${randomUUID().replaceAll('-','')}`;const base=process.env.TEST_DATABASE_URL??localDatabaseUrl;
 admin=database(base);await admin.query(`CREATE SCHEMA ${schema}`);const url=new URL(base);url.searchParams.set('options',`-c search_path=${schema},public`);
 pool=database(url.toString());peer=database(url.toString());
 for(const v of migrationVersions.filter(v=>v!=='012_private_text_retention'))await pool.query(await readFile(new URL(`../db/${v}.sql`,import.meta.url),'utf8'));
});
afterEach(async()=>{await pool.end();await peer.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();});
async function group(closedDaysAgo:number|null,state=closedDaysAgo===null?'COLLECTING':'OFFER_ISSUED',reviewed=true){
 const id=randomUUID(),actors=Array.from({length:2},()=>({userId:randomUUID(),emailVerified:true})),members=[randomUUID(),randomUUID()],prefs=[randomUUID(),randomUUID()],clarificationId=randomUUID();
 await pool.query(`INSERT INTO planning_groups(id,organizer_id,invite_digest,target_size,catalog,revision,state,created_at)
  VALUES($1,$2,$3,2,$4,1,$5,clock_timestamp()-interval '40 days')`,[id,actors[0].userId,randomUUID(),JSON.stringify(catalog),state]);
 for(let i=0;i<2;i++){
  await pool.query('INSERT INTO planning_members(id,group_id,user_id,display_name,admitted) VALUES($1,$2,$3,$4,true)',[members[i],id,actors[i].userId,`Person ${i}`]);
  const confirmed={memberId:members[i],revisionId:prefs[i],budgetMinor:5000,availableSlotIds:['thu-evening'],latestFinishAt:null,technique:'ANY',outcome:'FORM_OWN_CUP',collection:i===0?'NOMINEE_LATER':'SELF_LATER',nomineeMemberId:i===0?members[1]:null,extraRequirement:reviewed?'NONE':'MERCHANT_REVIEW_REQUIRED',unresolvedKeys:[]};
  await pool.query(`INSERT INTO preference_revisions(id,member_id,confirmed,optional_text,wording_bound,created_at)
   VALUES($1,$2,$3,$4,$5,clock_timestamp()-interval '39 days')`,[prefs[i],members[i],JSON.stringify(confirmed),i===0?note:null,reviewed?JSON.stringify({technique:'ANY',outcome:'FORM_OWN_CUP',collection:confirmed.collection,availableSlotIds:['thu-evening']}):null]);
  await pool.query('UPDATE planning_members SET current_preference_id=$2 WHERE id=$1',[members[i],prefs[i]]);
 }
 await pool.query('INSERT INTO collection_consents(preference_id,owner_member_id,nominee_member_id,owner_agreed,nominee_agreed,disclosure_agreed) VALUES($1,$2,$3,true,true,true)',[prefs[0],members[0],members[1]]);
 await pool.query(`INSERT INTO planning_clarifications(id,member_id,source_preference_id,source_group_revision,status,result)
  VALUES($1,$2,$3,1,$4,$5)`,[clarificationId,members[0],prefs[0],reviewed?'ANSWERED':'READY',JSON.stringify({interpretations:[{sourceSpan:note}],question:null})]);
 const commandId=randomUUID();await pool.query('INSERT INTO intake_commands VALUES($1,$2,$3,$4)',[commandId,actors[0].userId,fingerprint({groupId:id,optionalText:note}),JSON.stringify({preferenceId:prefs[0],revision:1})]);
 if(closedDaysAgo!==null)await pool.query("INSERT INTO planning_events(group_id,revision,kind,created_at) VALUES($1,1,'OFFER_OPENED',clock_timestamp()-make_interval(days=>$2))",[id,closedDaysAgo]);
 return {id,actors,members,prefs,clarificationId,commandId};
}
const rows=async(id:string)=>(await pool.query('SELECT p.* FROM preference_revisions p JOIN planning_members m ON m.id=p.member_id WHERE m.group_id=$1 ORDER BY p.id',[id])).rows;
// Time advancement only in a disposable schema. Production exposes no clock or
// retention override; its immutable-clock guard is separately tested below.
async function age(groupId:string){await transaction(pool,async c=>{
 await c.query('ALTER TABLE preference_revisions DISABLE TRIGGER immutable_private_text_clock');
 await c.query("UPDATE preference_revisions p SET private_text_expires_at=clock_timestamp()-interval '1 day' FROM planning_members m WHERE p.member_id=m.id AND m.group_id=$1",[groupId]);
 await c.query('ALTER TABLE preference_revisions ENABLE TRIGGER immutable_private_text_clock');
});}

test('retention starts at issued or abandoned planning, not roster closure or old note creation',async()=>{
 const collecting=await group(null),closed=await group(null,'CLOSED');await pool.query(up);
 assert.equal(await purgeExpiredPrivateText(pool),0);assert.ok((await rows(collecting.id)).every(p=>p.private_text_expires_at===null));assert.equal((await rows(closed.id)).find(p=>p.optional_text)?.optional_text,note);
 await pool.query("UPDATE planning_groups SET state='MERCHANT_REVIEW' WHERE id=$1",[closed.id]);assert.ok((await rows(closed.id)).every(p=>p.private_text_expires_at===null));
 const before=(await pool.query('SELECT clock_timestamp() AS t')).rows[0].t.getTime();await pool.query("UPDATE planning_groups SET state='OFFER_ISSUED' WHERE id=$1",[closed.id]);
 const after=(await pool.query('SELECT clock_timestamp() AS t')).rows[0].t.getTime();
 for(const p of await rows(closed.id))assert.ok(p.private_text_expires_at.getTime()>=before+30*86400000&&p.private_text_expires_at.getTime()<=after+30*86400000);
 await pool.query('UPDATE private_text_retention_policy SET retention_days=7 WHERE singleton');await pool.query("UPDATE planning_groups SET state='ABANDONED' WHERE id=$1",[collecting.id]);
 for(const p of await rows(collecting.id))assert.ok(Math.abs(p.private_text_expires_at.getTime()-Date.now()-7*86400000)<1000);
 assert.equal(await purgeExpiredPrivateText(pool),0);
});
test('legacy closure dates clear every expired note and quotation while recent and open rounds remain',async()=>{
 const expired=await group(31),recent=await group(29),open=await group(null);await pool.query(up);
 assert.equal(await purgeExpiredPrivateText(pool),2);assert.ok((await rows(expired.id)).every(p=>p.optional_text===null&&p.private_text_redacted_at!==null));
 assert.equal((await pool.query('SELECT status,result FROM planning_clarifications WHERE id=$1',[expired.clarificationId])).rows[0].result,null);
 assert.equal((await rows(recent.id)).find(p=>p.id===recent.prefs[0])!.optional_text,note);assert.equal((await rows(open.id)).find(p=>p.id===open.prefs[0])!.optional_text,note);
 assert.equal(await purgeExpiredPrivateText(pool),0);
});
test('private cleanup preserves confirmed meaning, consent, idempotency results and completed payment history',async()=>{
 const g=await group(31),offer=await createSandboxOffer(pool,{merchantId:'synthetic_merchant'}),provider=new SimulatedProvider(),engine=new PaymentEngine(pool,provider,{reconcileDelayMs:0});
 for(const m of offer.members){await engine.accept({commandId:randomUUID(),offerId:offer.id,actorId:m.userId,offerHash:offer.hash});await engine.step(offer.id);}
 for(const m of offer.members){await engine.authorize({commandId:randomUUID(),offerId:offer.id,actorId:m.userId,offerHash:offer.hash});await engine.step(offer.id);}
 for(let i=0;i<10;i++)await engine.step(offer.id);
 assert.equal((await pool.query('SELECT state FROM offers WHERE id=$1',[offer.id])).rows[0].state,'CONFIRMED');
 const financial=async()=>({offers:(await pool.query('SELECT * FROM offers ORDER BY id')).rows,ops:(await pool.query('SELECT * FROM payment_operations ORDER BY id')).rows,events:(await pool.query('SELECT * FROM payment_events ORDER BY seq')).rows});
 const before=await financial(),prefs=await rows(g.id),consents=(await pool.query('SELECT * FROM collection_consents')).rows,commands=(await pool.query('SELECT * FROM intake_commands')).rows;
 assert.ok(!JSON.stringify(commands).includes(note));const plan=await transaction(pool,c=>confirmedPlan(c,g.id,catalog));assert.equal(plan.result.state,'CANDIDATE_READY');
 await pool.query(up);assert.equal(await purgeExpiredPrivateText(pool),2);
 const changed=await rows(g.id);for(const p of changed){const original=prefs.find(o=>o.id===p.id)!;for(const field of ['id','member_id','confirmed','wording_bound','created_at'])assert.deepEqual(p[field],original[field]);}
 assert.deepEqual(await financial(),before);assert.deepEqual((await pool.query('SELECT * FROM collection_consents')).rows,consents);assert.deepEqual((await pool.query('SELECT * FROM intake_commands')).rows,commands);
 const after=await transaction(pool,c=>confirmedPlan(c,g.id,catalog));assert.deepEqual(after.result,plan.result);assert.equal(after.sourceHash,plan.sourceHash);
 const context=await new IntakeService(pool).participantContext(g.actors[0],g.id);assert.equal(context.optionalText,null);assert.equal(context.privateTextExpired,true);assert.equal(context.wordingReviewed,true);assert.equal(context.preference!.budgetMinor,5000);
 assert.deepEqual(provider.financialEffects,{captures:3,refunds:0,voids:0});
});
test('bounded and concurrent cleanup is idempotent and skips a planning command holding its group lock',async()=>{
 const held=await group(31),other=await group(31);await pool.query(up);const c=await peer.connect();
 try{await c.query('BEGIN');await c.query('SELECT id FROM planning_groups WHERE id=$1 FOR UPDATE',[held.id]);
  assert.equal(await purgeExpiredPrivateText(pool,1),1);assert.ok((await rows(held.id)).every(p=>p.private_text_redacted_at===null));
 }finally{await c.query('ROLLBACK');c.release();}
 const results=await Promise.all([purgeExpiredPrivateText(pool,1),purgeExpiredPrivateText(peer,1)]);assert.ok(results.every(n=>n<=1));
 await purgeExpiredPrivateText(pool);assert.equal(await purgeExpiredPrivateText(pool),0);
 assert.ok((await rows(held.id)).every(p=>p.private_text_redacted_at));assert.ok((await rows(other.id)).every(p=>p.private_text_redacted_at));
 await assert.rejects(purgeExpiredPrivateText(pool,0));await assert.rejects(pool.query('SELECT purge_expired_private_text(NULL)'),{code:'22023'});
});
test('retention dates cannot be extended, reset or resurrected through model quotations',async()=>{
 const g=await group(31);await pool.query(up);const original=(await rows(g.id)).find(p=>p.id===g.prefs[0])!;
 await assert.rejects(pool.query("UPDATE preference_revisions SET private_text_expires_at=private_text_expires_at+interval '1 day' WHERE id=$1",[g.prefs[0]]),{code:'23514'});
 await assert.rejects(pool.query('UPDATE preference_revisions SET private_text_expires_at=NULL WHERE id=$1',[g.prefs[0]]),{code:'23514'});
 await purgeExpiredPrivateText(pool);
 await assert.rejects(pool.query('UPDATE planning_clarifications SET result=$2 WHERE id=$1',[g.clarificationId,JSON.stringify({sourceSpan:note})]),{code:'23514'});
 await assert.rejects(pool.query('UPDATE preference_revisions SET optional_text=$2 WHERE id=$1',[g.prefs[0],note]),{code:'23514'});
 await assert.rejects(pool.query('UPDATE preference_revisions SET private_text_redacted_at=NULL WHERE id=$1',[g.prefs[0]]),{code:'23514'});
 assert.deepEqual((await rows(g.id)).find(p=>p.id===g.prefs[0])!.private_text_expires_at,original.private_text_expires_at);
});
test('reopening planning assigns new text a new deadline without extending the closed round',async()=>{
 const g=await group(0);await pool.query(up);const old=(await rows(g.id)).find(p=>p.id===g.prefs[0])!;
 await pool.query("UPDATE planning_groups SET state='CLOSED',revision=2 WHERE id=$1",[g.id]);await pool.query('UPDATE private_text_retention_policy SET retention_days=365 WHERE singleton');
 const saved=await new IntakeService(pool).save(g.actors[0],{commandId:randomUUID(),groupId:g.id,expectedRevision:2,expectedPreferenceId:g.prefs[0],optionalText:note,preference:{budgetMinor:5000,availableSlotIds:['thu-evening'],latestFinishAt:null,technique:'ANY',outcome:'FORM_OWN_CUP',collection:'NOMINEE_LATER',nomineeMemberId:g.members[1],extraRequirement:'NONE',unresolvedKeys:[]}});
 assert.equal((await rows(g.id)).find(p=>p.id===saved.preferenceId)!.private_text_expires_at,null);
 await pool.query("UPDATE planning_groups SET state='OFFER_ISSUED' WHERE id=$1",[g.id]);const updated=await rows(g.id);
 assert.deepEqual(updated.find(p=>p.id===g.prefs[0])!.private_text_expires_at,old.private_text_expires_at);
 assert.ok(updated.find(p=>p.id===saved.preferenceId)!.private_text_expires_at.getTime()>old.private_text_expires_at.getTime()+330*86400000);
});
test('expired owner reads hide raw wording and AI proposals before the next cleanup tick',async()=>{
 const g=await group(31,'CLOSED',false);await pool.query(up);const intake=new IntakeService(pool),clarifications=new ClarificationService(pool,async()=>{throw new Error('MUST_NOT_DISPATCH');});
 assert.equal((await intake.ownPreferences(g.actors[0],g.id)).optionalText,null);const context=await intake.participantContext(g.actors[0],g.id);assert.equal(context.optionalText,null);assert.equal(context.privateTextExpired,true);
 const view=await clarifications.view(g.actors[0],g.id);assert.equal(view!.proposal,null);assert.equal(view!.status,'STALE');
 await assert.rejects(clarifications.start(g.actors[0],{commandId:randomUUID(),groupId:g.id,expectedRevision:1,preferenceId:g.prefs[0],modelProcessingAgreed:true}),/NO_NOTE/);
 assert.equal((await rows(g.id)).find(p=>p.id===g.prefs[0])!.optional_text,note);await purgeExpiredPrivateText(pool);assert.ok((await rows(g.id)).every(p=>p.optional_text===null));
});
test('an in-flight clarification cannot restore quotations after retention wins',async()=>{
 const g=await group(null,'CLOSED',false);await pool.query('DELETE FROM planning_clarifications WHERE id=$1',[g.clarificationId]);await pool.query(up);
 let entered!:()=>void,release!:()=>void;const start=new Promise<void>(r=>entered=r),barrier=new Promise<void>(r=>release=r);
 const clarifications=new ClarificationService(pool,async input=>{entered();await barrier;return {status:'PROPOSAL',proposal:{schemaVersion:1,preferenceRevisionId:input.revisionId,interpretations:[{requirementKey:'COLLECTION',proposedValue:'SELF_LATER',sourceStart:0,sourceEnd:note.length,sourceSpan:note,certainty:'explicit'}],question:null}};});
 const running=clarifications.start(g.actors[0],{commandId:randomUUID(),groupId:g.id,expectedRevision:1,preferenceId:g.prefs[0],modelProcessingAgreed:true});await start;
 // Simulate elapsed retention time locally while preserving the editable round.
 await pool.query("UPDATE planning_groups SET state='OFFER_ISSUED' WHERE id=$1",[g.id]);await pool.query("UPDATE planning_groups SET state='CLOSED' WHERE id=$1",[g.id]);await age(g.id);assert.equal(await purgeExpiredPrivateText(peer),2);release();
 const view=await running;assert.equal(view!.status,'STALE');assert.equal(view!.proposal,null);
 const stored=(await pool.query('SELECT status,result FROM planning_clarifications WHERE member_id=$1',[g.members[0]])).rows;assert.ok(stored.every(row=>row.status==='STALE'&&row.result===null));
 assert.ok(!JSON.stringify((await pool.query('SELECT result FROM intake_commands')).rows).includes(note));
});
test('a reserved clarification retry cannot dispatch wording that expired before its model call',async()=>{
 const g=await group(31,'CLOSED',false);await pool.query('DELETE FROM planning_clarifications WHERE id=$1',[g.clarificationId]);
 await pool.query("INSERT INTO planning_clarifications(id,member_id,source_preference_id,source_group_revision,status) VALUES($1,$2,$3,1,'RESERVED')",[g.clarificationId,g.members[0],g.prefs[0]]);
 const command={commandId:randomUUID(),groupId:g.id,expectedRevision:1,preferenceId:g.prefs[0],modelProcessingAgreed:true};
 await pool.query('INSERT INTO intake_commands VALUES($1,$2,$3,$4)',[command.commandId,g.actors[0].userId,fingerprint({kind:'START_CLARIFICATION',...command}),JSON.stringify({id:g.clarificationId})]);
 await pool.query(up);let calls=0;const clarification=new ClarificationService(pool,async()=>{calls++;return {status:'NEEDS_REVIEW'};});
 const view=await clarification.start(g.actors[0],command);assert.equal(calls,0);assert.equal(view!.status,'STALE');assert.equal(view!.proposal,null);
});
test('editing after expiry preserves confirmed meaning before physical cleanup and never copies the old note',async()=>{
 const g=await group(31,'CLOSED');await pool.query(up);const intake=new IntakeService(pool),context=await intake.participantContext(g.actors[0],g.id);
 const {memberId:_,revisionId:__,...preference}=context.preference!;
 const saved=await intake.save(g.actors[0],{commandId:randomUUID(),groupId:g.id,expectedRevision:1,expectedPreferenceId:g.prefs[0],optionalText:null,preference:{...preference,budgetMinor:5100}});
 const stored=(await rows(g.id)).find(p=>p.id===saved.preferenceId)!;assert.equal(stored.optional_text,null);assert.deepEqual(stored.wording_bound,(await rows(g.id)).find(p=>p.id===g.prefs[0])!.wording_bound);
 assert.equal(stored.private_text_expires_at,null);assert.equal((await intake.participantContext(g.actors[0],g.id)).wordingReviewed,true);
 await purgeExpiredPrivateText(pool);assert.equal((await rows(g.id)).find(p=>p.id===saved.preferenceId)!.confirmed.budgetMinor,5100);
});
test('temporary relations cannot shadow private tables inside the elevated cleanup function',async()=>{
 const g=await group(31);await pool.query(up);const c=await pool.connect();
 try{
  await c.query('CREATE TEMP TABLE planning_groups(id uuid,revision integer)');await c.query('CREATE TEMP TABLE preference_revisions(id uuid)');
  const result=await c.query(`SELECT ${schema}.purge_expired_private_text(100) AS removed`);assert.equal(result.rows[0].removed,2);
  const config=(await c.query('SELECT proconfig FROM pg_proc WHERE oid=$1::regprocedure',[`${schema}.purge_expired_private_text(integer)`])).rows[0].proconfig;
  assert.ok(config.includes(`search_path=pg_catalog, ${schema}, pg_temp`));
  assert.equal((await c.query(`SELECT count(*) FROM ${schema}.preference_revisions WHERE optional_text IS NOT NULL`)).rows[0].count,'0');
 }finally{await c.query('DROP TABLE IF EXISTS pg_temp.planning_groups,pg_temp.preference_revisions');c.release();}
 assert.ok((await rows(g.id)).every(p=>p.private_text_redacted_at!==null));
});
test('retention migration reverses only on an empty schema and never removes populated privacy history',async()=>{
 const down=await readFile(new URL('../db/012_private_text_retention.down.sql',import.meta.url),'utf8');
 await pool.query(up);await pool.query(down);await pool.query(up);
 const g=await group(null);await assert.rejects(pool.query(down),{code:'23514'});
 assert.equal((await rows(g.id)).length,2);assert.equal(await purgeExpiredPrivateText(pool),0);
 const acl=await pool.query(`SELECT EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a
  WHERE p.oid=$1::regprocedure AND a.grantee=0 AND a.privilege_type='EXECUTE') AS public_execute`,[`${schema}.purge_expired_private_text(integer)`]);
 assert.equal(acl.rows[0].public_execute,false);
});
