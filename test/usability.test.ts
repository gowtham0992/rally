import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {database,localDatabaseUrl} from '../src/db.ts';
import {migrationVersions} from '../src/migrations.ts';
import {IntakeService,type IntakeActor} from '../src/intake/service.ts';
import {BookingService} from '../src/bookings/service.ts';
import {PaymentEngine} from '../src/payments/engine.ts';
import {SimulatedProvider} from './simulated-provider.ts';
const base=process.env.TEST_DATABASE_URL??localDatabaseUrl,schema=`usability_${randomUUID().replaceAll('-','')}`,admin=database(base);
const url=new URL(base);url.searchParams.set('options',`-c search_path=${schema},public`);const pool=database(url.toString()),intake=new IntakeService(pool),bookings=new BookingService(pool);
const catalog=JSON.parse(await readFile(new URL('../fixtures/studio.json',import.meta.url),'utf8'));
const pref={budgetMinor:5000,availableSlotIds:['thu-evening'],latestFinishAt:null,technique:'ANY',outcome:'FORM_OWN_CUP',collection:'SELF_LATER',nomineeMemberId:null,extraRequirement:'NONE',unresolvedKeys:[]};
const actor=():IntakeActor=>({userId:randomUUID(),emailVerified:true});
before(async()=>{await admin.query(`CREATE SCHEMA ${schema}`);for(const v of migrationVersions)await pool.query(await readFile(new URL(`../db/${v}.sql`,import.meta.url),'utf8'));});
after(async()=>{await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();});
async function setup(size=7){const actors=Array.from({length:size},actor),g=await intake.create(actors[0],{commandId:randomUUID(),targetSize:size,displayName:'Alex',catalog}),ids=[g.memberId],preferences:string[]=[];
 for(let i=1;i<size;i++)ids.push((await intake.join(actors[i],{commandId:randomUUID(),invite:g.invite,displayName:i===1?'Sam':i===2?'Jordan':`Friend ${i}`})).memberId);
 for(let i=0;i<size;i++){const c=await intake.participantContext(actors[i],g.groupId),saved=await intake.save(actors[i],{commandId:randomUUID(),groupId:g.groupId,expectedRevision:c.revision,expectedPreferenceId:null,preference:{...pref,...(i===1?{collection:'NOMINEE_LATER',unresolvedKeys:['COLLECTION']}:{} )},optionalText:null});preferences.push(saved.preferenceId);}
 return {actors,g,ids,preferences};
}
test('pickup can be requested and separately agreed before roster closure; peer statuses disclose no reasons',async()=>{
 const x=await setup(),c=await intake.participantContext(x.actors[1],x.g.groupId);
 assert.equal((await intake.participantContext(x.actors[2],x.g.groupId)).collectionRequests.length,0);
 const command={commandId:randomUUID(),groupId:x.g.groupId,expectedPreferenceId:x.preferences[1],nomineeMemberId:x.ids[2],disclosureAgreed:true};
 const asked=await intake.nominateCollector(x.actors[1],command);assert.deepEqual(await intake.nominateCollector(x.actors[1],command),asked);
 const organizer=await intake.participantContext(x.actors[0],x.g.groupId),collector=await intake.participantContext(x.actors[2],x.g.groupId);
 assert.equal(organizer.collectionRequests.length,0);assert.equal(organizer.members.find(m=>m.id===x.ids[2])?.stepStatus,'ACTION_NEEDED');
 assert.equal(collector.collectionRequests.length,1);assert.equal(collector.collectionRequests[0].nomineeAgreed,false);
 const text=JSON.stringify(organizer.members);for(const forbidden of ['budgetMinor','nomineeMemberId','optionalText','preferenceId','COLLECTION','TRAVEL','5000'])assert.ok(!text.includes(forbidden));
 await intake.collectionConsent(x.actors[2],{commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:collector.revision,preferenceId:asked.preferenceId,action:'NOMINEE_AGREE',disclosureAgreed:true});
 const agreed=await intake.participantContext(x.actors[0],x.g.groupId);assert.ok(agreed.members.every(m=>m.stepStatus==='READY'));
 await intake.closeRoster(x.actors[0],{commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:agreed.revision,memberIds:x.ids});assert.equal((await intake.plan(x.actors[0],x.g.groupId)).result.state,'CANDIDATE_READY');
 assert.equal((await pool.query('SELECT count(*) FROM payment_operations')).rows[0].count,'0');
});
test('pickup nomination rejects invented, foreign, self and unconsented actors without changing preferences',async()=>{
 const x=await setup(),value={commandId:randomUUID(),groupId:x.g.groupId,expectedPreferenceId:x.preferences[1],nomineeMemberId:x.ids[2],disclosureAgreed:true};
 await assert.rejects(intake.nominateCollector(x.actors[1],{...value,disclosureAgreed:false}));
 await assert.rejects(intake.nominateCollector(x.actors[0],value));
 for(const id of [randomUUID(),x.ids[1]])await assert.rejects(intake.nominateCollector(x.actors[1],{...value,nomineeMemberId:id}));
 assert.equal((await intake.ownPreferences(x.actors[1],x.g.groupId)).preference.revisionId,x.preferences[1]);
});
test('seven can become six; excluding a collector invalidates the arrangement and the removed friend gets an explicit notice',async()=>{
 const x=await setup(),asked=await intake.nominateCollector(x.actors[1],{commandId:randomUUID(),groupId:x.g.groupId,expectedPreferenceId:x.preferences[1],nomineeMemberId:x.ids[2],disclosureAgreed:true});
 let c=await intake.participantContext(x.actors[2],x.g.groupId);await intake.collectionConsent(x.actors[2],{commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:c.revision,preferenceId:asked.preferenceId,action:'NOMINEE_AGREE',disclosureAgreed:true});
 c=await intake.participantContext(x.actors[0],x.g.groupId);const command={commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:c.revision,memberIds:x.ids.filter(id=>id!==x.ids[2])};
 const changed=await intake.updateRoster(x.actors[0],command);assert.deepEqual(await intake.updateRoster(x.actors[0],command),changed);
 assert.equal(changed.targetSize,6);const owner=await intake.participantContext(x.actors[1],x.g.groupId);assert.equal(owner.collectionRequests[0].revoked,true);
 const removed=await intake.participantContext(x.actors[2],x.g.groupId);assert.equal(removed.excluded,true);assert.equal(removed.preference,null);assert.equal(removed.members.length,1);
 assert.equal((await intake.join(x.actors[2],{commandId:randomUUID(),invite:x.g.invite,displayName:'Jordan'})).memberId,x.ids[2]);assert.equal((await intake.participantContext(x.actors[2],x.g.groupId)).excluded,true);
 await assert.rejects(intake.save(x.actors[2],{commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:changed.revision,expectedPreferenceId:x.preferences[2],preference:pref,optionalText:null}),/NOT_FOUND/);
 const next=await intake.nominateCollector(x.actors[1],{commandId:randomUUID(),groupId:x.g.groupId,expectedPreferenceId:asked.preferenceId,nomineeMemberId:x.ids[3],disclosureAgreed:true});
 c=await intake.participantContext(x.actors[3],x.g.groupId);await intake.collectionConsent(x.actors[3],{commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:c.revision,preferenceId:next.preferenceId,action:'NOMINEE_AGREE',disclosureAgreed:true});
 c=await intake.participantContext(x.actors[0],x.g.groupId);await intake.closeRoster(x.actors[0],{commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:c.revision,memberIds:command.memberIds});assert.equal((await intake.plan(x.actors[0],x.g.groupId)).result.state,'CANDIDATE_READY');
});
test('five cannot book a six-person studio and roster changes are organizer-only, scoped and revision checked',async()=>{
 const x=await setup(6),c=await intake.participantContext(x.actors[0],x.g.groupId),command={commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:c.revision,memberIds:x.ids.slice(0,5)};
 await assert.rejects(intake.updateRoster(x.actors[1],command),/NOT_FOUND/);await assert.rejects(intake.updateRoster(x.actors[0],{...command,memberIds:[x.ids[0],randomUUID()]}),/INVALID_ROSTER/);
 const changed=await intake.updateRoster(x.actors[0],command);assert.equal(changed.targetSize,6);
 await assert.rejects(intake.closeRoster(x.actors[0],{...command,commandId:randomUUID(),expectedRevision:changed.revision}),/INVALID_ROSTER/);
 await assert.rejects(intake.updateRoster(x.actors[0],{...command,commandId:randomUUID()}),/STALE_REVISION/);
 await pool.query("UPDATE planning_groups SET state='OFFER_ISSUED' WHERE id=$1",[x.g.groupId]);await assert.rejects(intake.updateRoster(x.actors[0],{...command,commandId:randomUUID(),expectedRevision:changed.revision}),/PLANNING_LOCKED/);
});
test('removing the pickup owner tells the remaining collector their disclosed agreement is withdrawn',async()=>{
 const x=await setup(),asked=await intake.nominateCollector(x.actors[1],{commandId:randomUUID(),groupId:x.g.groupId,expectedPreferenceId:x.preferences[1],nomineeMemberId:x.ids[2],disclosureAgreed:true});
 let c=await intake.participantContext(x.actors[2],x.g.groupId);await intake.collectionConsent(x.actors[2],{commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:c.revision,preferenceId:asked.preferenceId,action:'NOMINEE_AGREE',disclosureAgreed:true});
 c=await intake.participantContext(x.actors[0],x.g.groupId);await intake.updateRoster(x.actors[0],{commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:c.revision,memberIds:x.ids.filter(id=>id!==x.ids[1])});
 const collector=await intake.participantContext(x.actors[2],x.g.groupId);assert.equal(collector.collectionRequests[0].revoked,true);assert.equal(collector.collectionRequests[0].ownerName,'Sam');assert.equal(collector.members.find(m=>m.id===x.ids[2])?.stepStatus,'READY');
});
test('pickup nomination cannot renew an expired private note or reveal its reason',async()=>{
 const x=await setup(),c=await intake.participantContext(x.actors[1],x.g.groupId);
 const saved=await intake.save(x.actors[1],{commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:c.revision,expectedPreferenceId:x.preferences[1],preference:{...pref,collection:'NOMINEE_LATER',unresolvedKeys:['COLLECTION']},optionalText:'Private travel reason'}),old=saved.preferenceId;
 await pool.query("UPDATE preference_revisions SET private_text_expires_at=clock_timestamp()-interval '1 day' WHERE id=$1",[old]);
 const next=await intake.nominateCollector(x.actors[1],{commandId:randomUUID(),groupId:x.g.groupId,expectedPreferenceId:old,nomineeMemberId:x.ids[2],disclosureAgreed:true});
 const row=(await pool.query('SELECT optional_text,private_text_expires_at FROM preference_revisions WHERE id=$1',[next.preferenceId])).rows[0];assert.equal(row.optional_text,null);
 assert.equal(row.private_text_expires_at.toISOString(),(await pool.query('SELECT private_text_expires_at FROM preference_revisions WHERE id=$1',[old])).rows[0].private_text_expires_at.toISOString());
 for(const a of [x.actors[0],x.actors[2]])assert.ok(!JSON.stringify(await intake.participantContext(a,x.g.groupId)).includes('Private travel reason'));
});
test('payment steps expose only organizer action states; a recovered round can change roster without changing its old offer or payment history',async()=>{
 const x=await setup(),merchant=actor(),asked=await intake.nominateCollector(x.actors[1],{commandId:randomUUID(),groupId:x.g.groupId,expectedPreferenceId:x.preferences[1],nomineeMemberId:x.ids[2],disclosureAgreed:true});
 let c=await intake.participantContext(x.actors[2],x.g.groupId);await intake.collectionConsent(x.actors[2],{commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:c.revision,preferenceId:asked.preferenceId,action:'NOMINEE_AGREE',disclosureAgreed:true});
 c=await intake.participantContext(x.actors[0],x.g.groupId);const closed=await intake.closeRoster(x.actors[0],{commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:c.revision,memberIds:x.ids});
 await pool.query('INSERT INTO merchant_studios VALUES($1,$2,$3,$4,15,20)',[catalog.studioId,merchant.userId,'synthetic_merchant',randomUUID()]);await pool.query('INSERT INTO merchant_catalog_versions VALUES($1,$2,$3)',[catalog.studioId,catalog.versionId,JSON.stringify(catalog)]);
 const req=await bookings.request(x.actors[0],{commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:closed.revision,offeringId:'handbuild',slotId:'thu-evening'}),issued=await bookings.approve(merchant,{commandId:randomUUID(),requestId:req.requestId,expectedRevision:req.revision,factsConfirmed:true,externalCalendarBlocked:true,automaticSettlementAgreed:true,collectionArrangementsAgreed:true});
 const engine=new PaymentEngine(pool,new SimulatedProvider(),{reconcileDelayMs:0}),command={commandId:randomUUID(),actorId:x.actors[0].userId,offerId:issued.offerId,offerHash:issued.offerHash};
 await engine.accept(command);await engine.step(issued.offerId);await engine.authorize({...command,commandId:randomUUID()});await engine.step(issued.offerId);
 const org=await bookings.offer(x.actors[0],issued.offerId),peer=await bookings.offer(x.actors[1],issued.offerId);assert.equal(org.approvalSteps?.find(m=>m.memberId===x.ids[0])?.status,'VERIFIED');assert.equal(peer.approvalSteps,null);assert.deepEqual(org.ownPickupNames,[]);assert.deepEqual(peer.ownPickupNames,[]);assert.deepEqual((await bookings.offer(x.actors[2],issued.offerId)).ownPickupNames,['Sam']);assert.deepEqual((await bookings.offer(merchant,issued.offerId)).ownPickupNames,[]);
 for(const m of org.approvalSteps!)assert.deepEqual(Object.keys(m).sort(),['displayName','memberId','status']);
 const snapshot=JSON.stringify(org.snapshot),reopen={commandId:randomUUID(),groupId:x.g.groupId,offerId:issued.offerId,offerHash:issued.offerHash,expectedRevision:issued.revision,acknowledgesNewApprovals:true,reviewRoster:true};
 await assert.rejects(bookings.reopen(x.actors[0],reopen),/PAYMENT_RECOVERY_REQUIRED/);
 await engine.withdraw({...command,commandId:randomUUID(),actorId:x.actors[6].userId});for(let i=0;i<30;i++)if(!await engine.step(issued.offerId))break;
 const oldOperations=JSON.stringify((await pool.query('SELECT * FROM payment_operations WHERE offer_id=$1 ORDER BY id',[issued.offerId])).rows);
 const reopened=await bookings.reopen(x.actors[0],reopen);c=await intake.participantContext(x.actors[0],x.g.groupId);assert.equal(c.state,'COLLECTING');
 await intake.updateRoster(x.actors[0],{commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:reopened.revision,memberIds:x.ids.slice(0,6)});
 assert.equal(JSON.stringify((await bookings.offer(x.actors[0],issued.offerId)).snapshot),snapshot);assert.equal(JSON.stringify((await pool.query('SELECT * FROM payment_operations WHERE offer_id=$1 ORDER BY id',[issued.offerId])).rows),oldOperations);
 const removed=await intake.participantContext(x.actors[6],x.g.groupId);assert.equal(removed.excluded,true);assert.equal(removed.previousOfferId,issued.offerId);assert.equal((await bookings.offer(x.actors[6],issued.offerId)).isParticipant,true);
});
test('roster updates racing studio approval cannot rewrite an issued offer or reserve a stale roster',async()=>{
 const x=await setup(),asked=await intake.nominateCollector(x.actors[1],{commandId:randomUUID(),groupId:x.g.groupId,expectedPreferenceId:x.preferences[1],nomineeMemberId:x.ids[2],disclosureAgreed:true});
 let c=await intake.participantContext(x.actors[2],x.g.groupId);await intake.collectionConsent(x.actors[2],{commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:c.revision,preferenceId:asked.preferenceId,action:'NOMINEE_AGREE',disclosureAgreed:true});
 c=await intake.participantContext(x.actors[0],x.g.groupId);const closed=await intake.closeRoster(x.actors[0],{commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:c.revision,memberIds:x.ids});
 const req=await bookings.request(x.actors[0],{commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:closed.revision,offeringId:'handbuild',slotId:'thu-evening'}),merchant={userId:(await pool.query('SELECT owner_user_id FROM merchant_studios WHERE studio_id=$1',[catalog.studioId])).rows[0].owner_user_id,emailVerified:true};
 const results=await Promise.allSettled([intake.updateRoster(x.actors[0],{commandId:randomUUID(),groupId:x.g.groupId,expectedRevision:req.revision,memberIds:x.ids.slice(0,6)}),bookings.approve(merchant,{commandId:randomUUID(),requestId:req.requestId,expectedRevision:req.revision,factsConfirmed:true,externalCalendarBlocked:true,automaticSettlementAgreed:true,collectionArrangementsAgreed:true})]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);const now=await intake.participantContext(x.actors[0],x.g.groupId);
 if(results[0].status==='fulfilled'){assert.equal(now.state,'COLLECTING');assert.equal(now.targetSize,6);assert.equal((await pool.query('SELECT count(*) FROM offer_snapshots WHERE group_id=$1',[x.g.groupId])).rows[0].count,'0');}
 else{assert.equal(now.state,'OFFER_ISSUED');assert.equal((await bookings.offer(x.actors[0],now.offerId!)).snapshot.roster.length,7);}
});
