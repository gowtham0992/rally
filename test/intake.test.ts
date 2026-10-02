import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {database,localDatabaseUrl} from '../src/db.ts';
import {IntakeService,type IntakeActor} from '../src/intake/service.ts';
const schema=`intake_test_${randomUUID().replaceAll('-','')}`,admin=database(process.env.TEST_DATABASE_URL??localDatabaseUrl);
const url=new URL(process.env.TEST_DATABASE_URL??localDatabaseUrl);url.searchParams.set('options',`-c search_path=${schema},public`);
const pool=database(url.toString()),service=new IntakeService(pool);
const catalog=JSON.parse(await readFile(new URL('../fixtures/studio.json',import.meta.url),'utf8'));
// Two-person fixture is explicitly synthetic; production keeps merchant capacity.
for(const o of catalog.offerings)o.minPeople=2;
before(async()=>{await admin.query(`CREATE SCHEMA ${schema}`);await pool.query(await readFile(new URL('../db/004_private_intake.sql',import.meta.url),'utf8'));await pool.query(await readFile(new URL('../db/005_collection_consent.sql',import.meta.url),'utf8'));});
after(async()=>{await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();});
const actor=():IntakeActor=>({userId:randomUUID(),emailVerified:true});
const pref={budgetMinor:5000,availableSlotIds:['thu-evening'],latestFinishAt:null,technique:'ANY',outcome:'FORM_OWN_CUP',collection:'SELF_LATER',nomineeMemberId:null,extraRequirement:'NONE',unresolvedKeys:[]};
async function setup(){const a=actor(),b=actor();const g=await service.create(a,{commandId:randomUUID(),targetSize:2,displayName:'Organizer',catalog});const joined=await service.join(b,{commandId:randomUUID(),invite:g.invite,displayName:'Participant'});return {a,b,g,joined};}
async function ready(){const x=await setup();let rev=x.joined.revision;
 const first=await service.save(x.a,{commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:rev,expectedPreferenceId:null,preference:pref,optionalText:'Private sentence'});rev=first.revision;
 const second=await service.save(x.b,{commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:rev,expectedPreferenceId:null,preference:pref,optionalText:null});
 const closed=await service.closeRoster(x.a,{commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:second.revision,memberIds:[x.g.memberId,x.joined.memberId]});return {...x,first,second,closed};}
test('organizer roster cannot expose private ceilings or text; reads and writes are actor scoped',async()=>{
 const x=await ready(),roster=await service.roster(x.a,x.g.groupId);
 assert.equal(roster.members.length,2);assert.ok(!JSON.stringify(roster).includes('budget'));assert.ok(!JSON.stringify(roster).includes('Private sentence'));
 assert.equal((await service.ownPreferences(x.a,x.g.groupId)).optionalText,'Private sentence');
 assert.equal((await service.ownPreferences(x.b,x.g.groupId)).optionalText,null);
 await assert.rejects(service.ownPreferences(actor(),x.g.groupId),/NOT_FOUND/);
 await assert.rejects(service.roster(x.b,x.g.groupId),/NOT_FOUND/);
 await assert.rejects(service.save(actor(),{commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:x.closed.revision,expectedPreferenceId:null,preference:pref,optionalText:null}),/NOT_FOUND/);
 const result=await service.plan(x.b,x.g.groupId);assert.equal(result.result.state,'CANDIDATE_READY');assert.ok(!JSON.stringify(result).includes('budgetMinor'));
});
test('command retries survive service restart; altered payload or actor conflicts',async()=>{
 const a=actor(),p={commandId:randomUUID(),targetSize:2,displayName:'Organizer',catalog};const results=await Promise.all([service.create(a,p),service.create(a,p)]);assert.deepEqual(results[0],results[1]);
 assert.deepEqual(await new IntakeService(pool).create(a,p),results[0]);
 await assert.rejects(service.create(a,{...p,targetSize:3}),/COMMAND_CONFLICT/);await assert.rejects(service.create(actor(),p),/COMMAND_CONFLICT/);
 assert.equal(Number((await pool.query('SELECT count(*) FROM planning_groups WHERE id=$1',[results[0].groupId])).rows[0].count),1);
});
test('concurrent preference edits cannot overwrite; immutable history survives and candidate invalidates',async()=>{
 const x=await ready();await service.plan(x.a,x.g.groupId);
 const p={groupId:x.g.groupId,expectedRevision:x.closed.revision,expectedPreferenceId:x.first.preferenceId,preference:{...pref,budgetMinor:4000},optionalText:null};
 const writes=await Promise.allSettled([service.save(x.a,{...p,commandId:randomUUID()}),service.save(x.a,{...p,commandId:randomUUID()})]);
 assert.equal(writes.filter(r=>r.status==='fulfilled').length,1);const rejected=writes.find(r=>r.status==='rejected');assert.ok(rejected?.status==='rejected'&&rejected.reason.code==='STALE_REVISION');
 assert.equal((await pool.query('SELECT candidate FROM planning_groups WHERE id=$1',[x.g.groupId])).rows[0].candidate,null);
 assert.equal((await pool.query('SELECT confirmed FROM preference_revisions WHERE id=$1',[x.first.preferenceId])).rows[0].confirmed.budgetMinor,5000);
 assert.equal((await service.plan(x.a,x.g.groupId)).result.state,'INFEASIBLE');
});
test('roster close requires organizer, exact ready target, own membership and valid group identities',async()=>{
 const x=await setup();const command={commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:x.joined.revision,memberIds:[x.g.memberId,x.joined.memberId]};
 await assert.rejects(service.closeRoster(x.b,command),/NOT_FOUND/);await assert.rejects(service.closeRoster(x.a,command),/INVALID_ROSTER/);
 await assert.rejects(service.closeRoster(x.a,{...command,memberIds:[x.g.memberId,randomUUID()]}),/INVALID_ROSTER/);
 await assert.rejects(service.plan(x.a,x.g.groupId),/NOT_FOUND/);
 const y=await ready();await assert.rejects(service.join(actor(),{commandId:randomUUID(),invite:y.g.invite,displayName:'Late'}),/ROSTER_CLOSED/);
});
test('unverified identity and extra identity fields fail closed; issued offer prevents preference edits',async()=>{
 const x=await ready();await assert.rejects(service.roster({...x.a,emailVerified:false},x.g.groupId),/VERIFIED_IDENTITY_REQUIRED/);
 await assert.rejects(service.save(x.a,{commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:x.closed.revision,expectedPreferenceId:x.first.preferenceId,preference:{...pref,memberId:x.joined.memberId},optionalText:null}));
 await pool.query("UPDATE planning_groups SET state='OFFER_ISSUED' WHERE id=$1",[x.g.groupId]);
 await assert.rejects(service.save(x.a,{commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:x.closed.revision,expectedPreferenceId:x.first.preferenceId,preference:pref,optionalText:null}),/PLANNING_LOCKED/);
});
test('unknown catalog slots fail and empty confirmed availability produces truthful infeasibility',async()=>{
 const x=await ready(),p={commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:x.closed.revision,expectedPreferenceId:x.first.preferenceId,preference:{...pref,availableSlotIds:['invented']},optionalText:null};
 await assert.rejects(service.save(x.a,p),/UNKNOWN_SLOT/);await service.save(x.a,{...p,preference:{...pref,availableSlotIds:[]}});
 assert.equal((await service.plan(x.a,x.g.groupId)).result.state,'INFEASIBLE');
});
test('private intake schema can migrate down and back up in an isolated empty schema',async()=>{
 const temporary=`intake_migration_${randomUUID().replaceAll('-','')}`;
 await admin.query(`CREATE SCHEMA ${temporary}`);
 const migrationUrl=new URL(process.env.TEST_DATABASE_URL??localDatabaseUrl);migrationUrl.searchParams.set('options',`-c search_path=${temporary},public`);
 const migrated=database(migrationUrl.toString());
 try{for(const file of ['004_private_intake.sql','005_collection_consent.sql','005_collection_consent.down.sql','004_private_intake.down.sql','004_private_intake.sql','005_collection_consent.sql'])await migrated.query(await readFile(new URL('../db/'+file,import.meta.url),'utf8'));
 assert.equal((await migrated.query('SELECT count(*) FROM preference_revisions')).rows[0].count,'0');
 }finally{await migrated.end();await admin.query(`DROP SCHEMA ${temporary} CASCADE`);}
});
async function nomination(){const x=await ready();const saved=await service.save(x.a,{commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:x.closed.revision,expectedPreferenceId:x.first.preferenceId,preference:{...pref,collection:'NOMINEE_LATER',nomineeMemberId:x.joined.memberId},optionalText:'Private travel story'});
 const command=(revision:number,action:string)=>({commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:revision,preferenceId:saved.preferenceId,action,disclosureAgreed:true});return {...x,saved,command};}
test('nominated collection requires current owner disclosure and separate nominee agreement',async()=>{
 const x=await nomination();assert.equal((await service.plan(x.a,x.g.groupId)).result.state,'NEEDS_CLARIFICATION');
 assert.deepEqual(await service.collectionRequests(x.b,x.g.groupId),[]);
 await assert.rejects(service.collectionConsent(x.b,x.command(x.saved.revision,'NOMINEE_AGREE')),/OWNER_CONSENT_REQUIRED/);
 await assert.rejects(service.collectionConsent(x.b,x.command(x.saved.revision,'OWNER_AGREE')),/NOT_FOUND/);
 await assert.rejects(service.collectionConsent(x.a,{...x.command(x.saved.revision,'OWNER_AGREE'),disclosureAgreed:false}),/DISCLOSURE_REQUIRED/);
 const ownerCommand=x.command(x.saved.revision,'OWNER_AGREE'),owner=await service.collectionConsent(x.a,ownerCommand);
 assert.deepEqual(await new IntakeService(pool).collectionConsent(x.a,ownerCommand),owner);
 const requests=await service.collectionRequests(x.b,x.g.groupId);assert.equal(requests[0].role,'NOMINEE');assert.equal(requests[0].ownerName,'Organizer');assert.ok(!JSON.stringify(requests).includes('budget'));assert.ok(!JSON.stringify(requests).includes('Private travel'));
 assert.equal((await service.plan(x.a,x.g.groupId)).result.state,'NEEDS_CLARIFICATION');
 await assert.rejects(service.collectionConsent(x.a,x.command(owner.revision,'NOMINEE_AGREE')),/NOT_FOUND/);
 await service.collectionConsent(x.b,x.command(owner.revision,'NOMINEE_AGREE'));
 assert.equal((await service.plan(x.a,x.g.groupId)).result.state,'CANDIDATE_READY');
});
test('either collection party may revoke; stale consent cannot be revived or satisfy a changed preference',async()=>{
 const x=await nomination(),a=await service.collectionConsent(x.a,x.command(x.saved.revision,'OWNER_AGREE')),b=await service.collectionConsent(x.b,x.command(a.revision,'NOMINEE_AGREE'));
 await service.plan(x.a,x.g.groupId);const revoked=await service.collectionConsent(x.b,x.command(b.revision,'REVOKE'));
 assert.equal((await pool.query('SELECT candidate FROM planning_groups WHERE id=$1',[x.g.groupId])).rows[0].candidate,null);
 assert.equal((await service.plan(x.a,x.g.groupId)).result.state,'NEEDS_CLARIFICATION');
 await assert.rejects(service.collectionConsent(x.a,x.command(revoked.revision,'OWNER_AGREE')),/CONSENT_REVOKED/);
 const saved=await service.save(x.a,{commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:revoked.revision,expectedPreferenceId:x.saved.preferenceId,preference:{...pref,collection:'NOMINEE_LATER',nomineeMemberId:x.joined.memberId},optionalText:null});
 assert.equal((await service.plan(x.a,x.g.groupId)).result.state,'NEEDS_CLARIFICATION');assert.deepEqual(await service.collectionRequests(x.b,x.g.groupId),[]);
 await assert.rejects(service.collectionConsent(x.a,x.command(saved.revision,'OWNER_AGREE')),/STALE_PREFERENCE/);
 assert.equal(Number((await pool.query('SELECT count(*) FROM collection_consent_events WHERE preference_id=$1',[x.saved.preferenceId])).rows[0].count),3);
});
test('collection commands reject outsiders and races; frozen offers require cancellation review',async()=>{
 const x=await nomination();await assert.rejects(service.collectionConsent(actor(),x.command(x.saved.revision,'OWNER_AGREE')),/NOT_FOUND/);
 const owner=await service.collectionConsent(x.a,x.command(x.saved.revision,'OWNER_AGREE'));
 const competing=await Promise.allSettled([service.collectionConsent(x.b,x.command(owner.revision,'NOMINEE_AGREE')),service.collectionConsent(x.a,x.command(owner.revision,'REVOKE'))]);
 assert.equal(competing.filter(r=>r.status==='fulfilled').length,1);assert.ok(competing.some(r=>r.status==='rejected'&&r.reason.code==='STALE_REVISION'));
 const roster=await service.roster(x.a,x.g.groupId);await pool.query("UPDATE planning_groups SET state='OFFER_ISSUED' WHERE id=$1",[x.g.groupId]);
 await assert.rejects(service.collectionConsent(x.a,x.command(roster.revision,'REVOKE')),/COLLECTION_REVIEW_REQUIRED/);
});
test('browser participant context combines consistent revision with only caller private inputs',async()=>{
 const x=await ready();const a=await service.participantContext(x.a,x.g.groupId),b=await service.participantContext(x.b,x.g.groupId);
 assert.equal(a.optionalText,'Private sentence');assert.equal(b.optionalText,null);assert.equal(b.isOrganizer,false);assert.equal(a.members.length,2);
 assert.equal(a.organizerInvite,x.g.invite);assert.equal(b.organizerInvite,null);assert.ok(!JSON.stringify(b).includes(x.g.invite));
 assert.equal(a.revision,x.closed.revision);assert.equal(a.preference?.revisionId,x.first.preferenceId);
 assert.ok(!JSON.stringify(b).includes('Private sentence'));assert.ok(!JSON.stringify(b.members).includes('budgetMinor'));
 await assert.rejects(service.participantContext(actor(),x.g.groupId),/NOT_FOUND/);
 await assert.rejects(service.participantContext({...x.a,emailVerified:false},x.g.groupId),/VERIFIED_IDENTITY_REQUIRED/);
});
test('closed browser context shows only the admitted roster and rejects an excluded joiner',async()=>{
 const x=await setup(),excluded=actor();const joined=await service.join(excluded,{commandId:randomUUID(),invite:x.g.invite,displayName:'Excluded joiner'});
 const a=await service.save(x.a,{commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:joined.revision,expectedPreferenceId:null,preference:pref,optionalText:null});
 const b=await service.save(x.b,{commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:a.revision,expectedPreferenceId:null,preference:pref,optionalText:null});
 await service.closeRoster(x.a,{commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:b.revision,memberIds:[x.g.memberId,x.joined.memberId]});
 const context=await service.participantContext(x.a,x.g.groupId);assert.equal(context.members.length,2);assert.ok(context.members.every(m=>m.admitted));assert.ok(!JSON.stringify(context.members).includes('Excluded joiner'));
 await assert.rejects(service.participantContext(excluded,x.g.groupId),/NOT_FOUND/);
});
