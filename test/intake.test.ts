import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {database,localDatabaseUrl} from '../src/db.ts';
import {ClarificationService} from '../src/intake/clarifications.ts';
import {IntakeService,type IntakeActor} from '../src/intake/service.ts';
const schema=`intake_test_${randomUUID().replaceAll('-','')}`,admin=database(process.env.TEST_DATABASE_URL??localDatabaseUrl);
const url=new URL(process.env.TEST_DATABASE_URL??localDatabaseUrl);url.searchParams.set('options',`-c search_path=${schema},public`);
const pool=database(url.toString()),service=new IntakeService(pool);
const catalog=JSON.parse(await readFile(new URL('../fixtures/studio.json',import.meta.url),'utf8'));
// Two-person fixture is explicitly synthetic; production keeps merchant capacity.
for(const o of catalog.offerings)o.minPeople=2;
before(async()=>{await admin.query(`CREATE SCHEMA ${schema}`);await pool.query(await readFile(new URL('../db/004_private_intake.sql',import.meta.url),'utf8'));await pool.query(await readFile(new URL('../db/005_collection_consent.sql',import.meta.url),'utf8'));await pool.query(await readFile(new URL('../db/007_clarifications.sql',import.meta.url),'utf8'));});
after(async()=>{await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();});
const actor=():IntakeActor=>({userId:randomUUID(),emailVerified:true});
const pref={budgetMinor:5000,availableSlotIds:['thu-evening'],latestFinishAt:null,technique:'ANY',outcome:'FORM_OWN_CUP',collection:'SELF_LATER',nomineeMemberId:null,extraRequirement:'NONE',unresolvedKeys:[]};
test('an early friend can save a collection need before another friend joins without creating a bookable plan',async()=>{
 const a=actor(),b=actor(),g=await service.create(a,{commandId:randomUUID(),targetSize:2,displayName:'Early friend',catalog});
 const saved=await service.save(a,{commandId:randomUUID(),groupId:g.groupId,expectedRevision:g.revision,expectedPreferenceId:null,preference:{...pref,collection:'NOMINEE_LATER',unresolvedKeys:['COLLECTION']},optionalText:null});
 const own=await service.ownPreferences(a,g.groupId);assert.equal(own.preference.nomineeMemberId,null);assert.equal(own.preference.collection,'NOMINEE_LATER');
 const joined=await service.join(b,{commandId:randomUUID(),invite:g.invite,displayName:'Later friend'});
 const second=await service.save(b,{commandId:randomUUID(),groupId:g.groupId,expectedRevision:joined.revision,expectedPreferenceId:null,preference:pref,optionalText:null});
 await service.closeRoster(a,{commandId:randomUUID(),groupId:g.groupId,expectedRevision:second.revision,memberIds:[g.memberId,joined.memberId]});
 const result=await service.plan(a,g.groupId);assert.equal(result.result.state,'NEEDS_CLARIFICATION');assert.equal((await service.ownPreferences(a,g.groupId)).preference.revisionId,saved.preferenceId);
 assert.equal((await service.participantContext(a,g.groupId)).collectionRequests.length,0);
});
async function setup(){const a=actor(),b=actor();const g=await service.create(a,{commandId:randomUUID(),targetSize:2,displayName:'Organizer',catalog});const joined=await service.join(b,{commandId:randomUUID(),invite:g.invite,displayName:'Participant'});return {a,b,g,joined};}
async function ready(){const x=await setup();let rev=x.joined.revision;
 const draft=await service.save(x.a,{commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:rev,expectedPreferenceId:null,preference:pref,optionalText:'Private sentence'});const first=await new ClarificationService(pool).confirmStructuredNote(x.a,{commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:draft.revision,preferenceId:draft.preferenceId,declaresNoAdditionalMustHaves:true});rev=first.revision;
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
test('leave-by accepts only published local dates and rejects without changing saved history',async()=>{
 const x=await ready(),value={commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:x.closed.revision,expectedPreferenceId:x.first.preferenceId,preference:{...pref,latestFinishAt:'2026-11-22T02:00:00.000Z'},optionalText:null};
 await assert.rejects(service.save(x.a,value),/UNKNOWN_FINISH_DATE/);
 const unchanged=await service.participantContext(x.a,x.g.groupId);
 assert.equal(unchanged.revision,x.closed.revision);assert.equal(unchanged.preference?.revisionId,x.first.preferenceId);assert.equal(unchanged.preference?.latestFinishAt,null);
 assert.equal(Number((await pool.query('SELECT count(*) FROM preference_revisions WHERE member_id=$1',[x.g.memberId])).rows[0].count),2);
 // A global cutoff on Friday is valid even when only Thursday is selected.
 await service.save(x.a,{...value,preference:{...pref,latestFinishAt:'2026-11-21T02:00:00.000Z'}});
 assert.equal((await service.plan(x.a,x.g.groupId)).result.state,'CANDIDATE_READY');
});
test('private leave-by survives retries and limits planning until the participant removes it',async()=>{
 const x=await ready(),deadline='2026-11-20T02:00:30.123Z',value={commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:x.closed.revision,expectedPreferenceId:x.first.preferenceId,preference:{...pref,latestFinishAt:deadline},optionalText:null};
 const saved=await service.save(x.a,value);assert.deepEqual(await new IntakeService(pool).save(x.a,value),saved);
 assert.equal((await service.participantContext(x.a,x.g.groupId)).preference?.latestFinishAt,deadline);
 assert.ok(!JSON.stringify(await service.participantContext(x.b,x.g.groupId)).includes(deadline));
 assert.ok(!JSON.stringify(await service.roster(x.a,x.g.groupId)).includes('latestFinishAt'));
 assert.equal((await service.plan(x.a,x.g.groupId)).result.state,'INFEASIBLE');
 assert.equal(Number((await pool.query('SELECT count(*) FROM preference_revisions WHERE member_id=$1',[x.g.memberId])).rows[0].count),3);
 await service.save(x.a,{...value,commandId:randomUUID(),expectedRevision:saved.revision,expectedPreferenceId:saved.preferenceId,preference:pref});
 assert.equal((await service.plan(x.a,x.g.groupId)).result.state,'CANDIDATE_READY');
});
test('private intake schema can migrate down and back up in an isolated empty schema',async()=>{
 const temporary=`intake_migration_${randomUUID().replaceAll('-','')}`;
 await admin.query(`CREATE SCHEMA ${temporary}`);
 const migrationUrl=new URL(process.env.TEST_DATABASE_URL??localDatabaseUrl);migrationUrl.searchParams.set('options',`-c search_path=${temporary},public`);
 const migrated=database(migrationUrl.toString());
 try{for(const file of ['004_private_intake.sql','005_collection_consent.sql','007_clarifications.sql','007_clarifications.down.sql','005_collection_consent.down.sql','004_private_intake.down.sql','004_private_intake.sql','005_collection_consent.sql','007_clarifications.sql'])await migrated.query(await readFile(new URL('../db/'+file,import.meta.url),'utf8'));
 assert.equal((await migrated.query('SELECT count(*) FROM preference_revisions')).rows[0].count,'0');
 }finally{await migrated.end();await admin.query(`DROP SCHEMA ${temporary} CASCADE`);}
});
async function nomination(){const x=await ready();const draft=await service.save(x.a,{commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:x.closed.revision,expectedPreferenceId:x.first.preferenceId,preference:{...pref,collection:'NOMINEE_LATER',nomineeMemberId:x.joined.memberId},optionalText:'Private travel story'});const saved=await new ClarificationService(pool).confirmStructuredNote(x.a,{commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:draft.revision,preferenceId:draft.preferenceId,declaresNoAdditionalMustHaves:true});
 const command=(revision:number,action:string)=>({commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:revision,preferenceId:saved.preferenceId,action,disclosureAgreed:true});return {...x,saved,command};}
test('nominated collection requires current owner disclosure and separate nominee agreement',async()=>{
 const x=await nomination();assert.equal((await service.plan(x.a,x.g.groupId)).result.state,'NEEDS_CLARIFICATION');
 const pendingOwner=await service.collectionRequests(x.a,x.g.groupId);assert.equal(pendingOwner.length,1);assert.equal(pendingOwner[0].ownerAgreed,false);assert.equal(pendingOwner[0].nomineeAgreed,false);
 assert.equal((await service.participantContext(x.a,x.g.groupId)).collectionRequests.length,1);
 assert.deepEqual((await service.participantContext(x.b,x.g.groupId)).collectionRequests,[]);
 assert.deepEqual(await service.collectionRequests(x.b,x.g.groupId),[]);
 assert.equal((await service.plans(x.a)).plans[0].collectionNextStep,'ASK_COLLECTOR');assert.equal((await service.plans(x.b)).plans[0].collectionNextStep,null);
 await assert.rejects(service.collectionConsent(x.b,x.command(x.saved.revision,'NOMINEE_AGREE')),/OWNER_CONSENT_REQUIRED/);
 await assert.rejects(service.collectionConsent(x.b,x.command(x.saved.revision,'OWNER_AGREE')),/NOT_FOUND/);
 await assert.rejects(service.collectionConsent(x.a,{...x.command(x.saved.revision,'OWNER_AGREE'),disclosureAgreed:false}),/DISCLOSURE_REQUIRED/);
 const ownerCommand=x.command(x.saved.revision,'OWNER_AGREE'),owner=await service.collectionConsent(x.a,ownerCommand);
 assert.deepEqual(await new IntakeService(pool).collectionConsent(x.a,ownerCommand),owner);
 assert.equal((await service.plans(x.a)).plans[0].collectionNextStep,null);const nomineeIndex=await service.plans(x.b);assert.equal(nomineeIndex.plans[0].collectionNextStep,'REVIEW_REQUEST');for(const forbidden of ['Private travel','budgetMinor','preferenceId','nomineeMemberId'])assert.ok(!JSON.stringify(nomineeIndex).includes(forbidden));
 const browserRequests=(await service.participantContext(x.b,x.g.groupId)).collectionRequests;assert.equal(browserRequests.length,1);assert.equal(browserRequests[0].ownerAgreed,true);assert.equal(browserRequests[0].nomineeAgreed,false);assert.ok(!JSON.stringify(browserRequests).includes('Private travel'));assert.ok(!JSON.stringify(browserRequests).includes('budget'));
 const requests=await service.collectionRequests(x.b,x.g.groupId);assert.equal(requests[0].role,'NOMINEE');assert.equal(requests[0].ownerName,'Organizer');assert.ok(!JSON.stringify(requests).includes('budget'));assert.ok(!JSON.stringify(requests).includes('Private travel'));
 assert.equal((await service.plan(x.a,x.g.groupId)).result.state,'NEEDS_CLARIFICATION');
 await assert.rejects(service.collectionConsent(x.a,x.command(owner.revision,'NOMINEE_AGREE')),/NOT_FOUND/);
 await service.collectionConsent(x.b,x.command(owner.revision,'NOMINEE_AGREE'));
 assert.equal((await service.plan(x.a,x.g.groupId)).result.state,'CANDIDATE_READY');assert.equal((await service.plans(x.a)).plans[0].collectionNextStep,null);assert.equal((await service.plans(x.b)).plans[0].collectionNextStep,null);
});
test('either collection party may revoke; stale consent cannot be revived or satisfy a changed preference',async()=>{
 const x=await nomination(),a=await service.collectionConsent(x.a,x.command(x.saved.revision,'OWNER_AGREE')),b=await service.collectionConsent(x.b,x.command(a.revision,'NOMINEE_AGREE'));
 await service.plan(x.a,x.g.groupId);const revoked=await service.collectionConsent(x.b,x.command(b.revision,'REVOKE'));assert.equal((await service.plans(x.a)).plans[0].collectionNextStep,'CHOOSE_COLLECTOR');assert.equal((await service.plans(x.b)).plans[0].collectionNextStep,null);
 assert.equal((await pool.query('SELECT candidate FROM planning_groups WHERE id=$1',[x.g.groupId])).rows[0].candidate,null);
 assert.equal((await service.plan(x.a,x.g.groupId)).result.state,'NEEDS_CLARIFICATION');
 await assert.rejects(service.collectionConsent(x.a,x.command(revoked.revision,'OWNER_AGREE')),/CONSENT_REVOKED/);
 const saved=await service.save(x.a,{commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:revoked.revision,expectedPreferenceId:x.saved.preferenceId,preference:{...pref,collection:'NOMINEE_LATER',nomineeMemberId:x.joined.memberId},optionalText:null});
 assert.equal((await service.plan(x.a,x.g.groupId)).result.state,'NEEDS_CLARIFICATION');assert.deepEqual(await service.collectionRequests(x.b,x.g.groupId),[]);assert.equal((await service.plans(x.a)).plans[0].collectionNextStep,'ASK_COLLECTOR');assert.equal((await service.plans(x.b)).plans[0].collectionNextStep,null);
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
test('your plans lists only current membership and never includes private requirements or invites',async()=>{
 const x=await ready(),other=await ready(),index=await service.plans(x.b);
 assert.deepEqual(index.plans.map(p=>p.groupId),[x.g.groupId]);assert.equal(index.nextCursor,null);
 assert.equal(index.plans[0].isOrganizer,false);assert.equal(index.plans[0].readyCount,2);assert.equal(index.plans[0].ownReady,true);assert.equal(index.plans[0].deadline,null);
 assert.deepEqual(index.plans[0].members.map(m=>m.displayName).sort(),['Organizer','Participant']);
 const serialized=JSON.stringify(index);for(const secret of ['budgetMinor','latestFinishAt','Private sentence','confirmed',x.g.invite,other.g.groupId])assert.ok(!serialized.includes(secret));
 assert.deepEqual((await service.plans(actor())).plans,[]);
 await assert.rejects(service.plans({...x.b,emailVerified:false}),/VERIFIED_IDENTITY_REQUIRED/);
 await assert.rejects(service.plans(x.b,other.g.groupId),/NOT_FOUND/);
 await assert.rejects(service.plans(x.b,'invented'));
});
test('your plans hides a joiner once the organizer excludes them from the closed roster',async()=>{
 const x=await setup(),excluded=actor();await service.join(excluded,{commandId:randomUUID(),invite:x.g.invite,displayName:'Excluded'});
 const before=(await service.plans(excluded)).plans;assert.equal(before.length,1);assert.equal(before[0].ownReady,false);assert.equal((await service.plans(x.a)).plans[0].ownReady,false);
 assert.equal((await service.plans(excluded)).plans[0].deadline,null);
 const context=await service.participantContext(x.a,x.g.groupId),a=await service.save(x.a,{commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:context.revision,expectedPreferenceId:null,preference:pref,optionalText:null});
 const b=await service.save(x.b,{commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:a.revision,expectedPreferenceId:null,preference:pref,optionalText:null});
 await service.closeRoster(x.a,{commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:b.revision,memberIds:[x.g.memberId,x.joined.memberId]});
 assert.deepEqual((await service.plans(excluded)).plans,[]);
 await assert.rejects(service.plans(excluded,x.g.groupId),/NOT_FOUND/);
 assert.ok(!(await service.plans(x.b)).plans[0].members.some(m=>m.displayName==='Excluded'));
});
test('your plans pages twenty records with exact timestamp ordering, equal-time ties and an owned cursor',async()=>{
 const a=actor(),groups=[];
 for(let i=0;i<25;i++)groups.push(await service.create(a,{commandId:randomUUID(),targetSize:2,displayName:'Me',catalog}));
 for(let i=0;i<groups.length;i++)await pool.query("UPDATE planning_groups SET created_at=$2::timestamptz WHERE id=$1",[groups[i].groupId,i<5?'2026-10-01T00:00:00.123456Z':`2026-10-01T00:00:00.${String(123500+i).padStart(6,'0')}Z`]);
 const expected=(await pool.query('SELECT id FROM planning_groups WHERE organizer_id=$1 ORDER BY created_at DESC,id DESC',[a.userId])).rows.map(r=>r.id);
 const first=await service.plans(a);assert.equal(first.plans.length,20);assert.equal(first.nextCursor,first.plans.at(-1)?.groupId);
 const second=await new IntakeService(pool).plans(a,first.nextCursor);assert.equal(second.plans.length,5);assert.equal(second.nextCursor,null);
 assert.deepEqual([...first.plans,...second.plans].map(p=>p.groupId),expected);
 // A cursor that no longer belongs to visible membership must fail closed.
 await pool.query("UPDATE planning_groups SET state='ABANDONED' WHERE id=$1",[first.nextCursor]);
 await assert.rejects(service.plans(a,first.nextCursor),/NOT_FOUND/);
});
test('closed browser context shows only the admitted roster and rejects an excluded joiner',async()=>{
 const x=await setup(),excluded=actor();const joined=await service.join(excluded,{commandId:randomUUID(),invite:x.g.invite,displayName:'Excluded joiner'});
 const a=await service.save(x.a,{commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:joined.revision,expectedPreferenceId:null,preference:pref,optionalText:null});
 const b=await service.save(x.b,{commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:a.revision,expectedPreferenceId:null,preference:pref,optionalText:null});
 await service.closeRoster(x.a,{commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:b.revision,memberIds:[x.g.memberId,x.joined.memberId]});
 const context=await service.participantContext(x.a,x.g.groupId);assert.equal(context.members.length,2);assert.ok(context.members.every(m=>m.admitted));assert.ok(!JSON.stringify(context.members).includes('Excluded joiner'));
 await assert.rejects(service.participantContext(excluded,x.g.groupId),/NOT_FOUND/);
});

test('a closed roster never counts or asks an excluded collector; the owner must choose an admitted friend',async()=>{
 const x=await setup(),excluded=actor();const joined=await service.join(excluded,{commandId:randomUUID(),invite:x.g.invite,displayName:'Excluded collector'});
 const a=await service.save(x.a,{commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:joined.revision,expectedPreferenceId:null,preference:{...pref,collection:'NOMINEE_LATER',nomineeMemberId:joined.memberId},optionalText:null});
 const b=await service.save(x.b,{commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:a.revision,expectedPreferenceId:null,preference:pref,optionalText:null});
 const closed=await service.closeRoster(x.a,{commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:b.revision,memberIds:[x.g.memberId,x.joined.memberId]});
 assert.deepEqual((await service.participantContext(x.a,x.g.groupId)).collectionRequests,[]);
 assert.equal((await service.plan(x.a,x.g.groupId)).result.state,'NEEDS_CLARIFICATION');
 await assert.rejects(service.save(x.a,{commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:closed.revision,expectedPreferenceId:a.preferenceId,preference:{...pref,collection:'NOMINEE_LATER',nomineeMemberId:joined.memberId},optionalText:null}),/INVALID_NOMINEE/);
 await service.save(x.a,{commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:closed.revision,expectedPreferenceId:a.preferenceId,preference:{...pref,collection:'NOMINEE_LATER',nomineeMemberId:x.joined.memberId},optionalText:null});
 assert.equal((await service.participantContext(x.a,x.g.groupId)).collectionRequests[0].ownerAgreed,false);
 assert.deepEqual((await service.participantContext(x.b,x.g.groupId)).collectionRequests,[]);
});

test('six different friends save from the same group revision without overwriting one another',async()=>{
 const actors=Array.from({length:6},actor),g=await service.create(actors[0],{commandId:randomUUID(),targetSize:6,displayName:'Organizer',catalog});
 for(let i=1;i<6;i++)await service.join(actors[i],{commandId:randomUUID(),invite:g.invite,displayName:`Friend ${i}`});
 const revision=(await service.roster(actors[0],g.groupId)).revision;
 const results=await Promise.all(actors.map((a,i)=>service.save(a,{commandId:randomUUID(),groupId:g.groupId,expectedRevision:revision,expectedPreferenceId:null,preference:{...pref,budgetMinor:5000+i},optionalText:null})));
 assert.equal(results.length,6);for(let i=0;i<6;i++)assert.equal((await service.ownPreferences(actors[i],g.groupId)).preference.budgetMinor,5000+i);
 await assert.rejects(service.closeRoster(actors[0],{commandId:randomUUID(),groupId:g.groupId,expectedRevision:revision,memberIds:(await service.roster(actors[0],g.groupId)).members.map(m=>m.id)}),/STALE_REVISION/);
});
test('original invite returns admitted members after closure but rejects newcomers and excluded members',async()=>{
 const x=await ready();const again=await service.join(x.b,{commandId:randomUUID(),invite:x.g.invite,displayName:'Changed'});
 assert.equal(again.groupId,x.g.groupId);assert.equal(again.memberId,x.joined.memberId);
 assert.equal((await service.participantContext(x.b,x.g.groupId)).displayName,'Participant');
 await assert.rejects(service.join(actor(),{commandId:randomUUID(),invite:x.g.invite,displayName:'New'}),/ROSTER_CLOSED/);
 await pool.query('UPDATE planning_members SET admitted=false WHERE id=$1',[x.joined.memberId]);
 await assert.rejects(service.join(x.b,{commandId:randomUUID(),invite:x.g.invite,displayName:'Excluded'}),/ROSTER_CLOSED/);
});
