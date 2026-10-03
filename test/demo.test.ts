import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {database,localDatabaseUrl,transaction} from '../src/db.ts';
import {migrationVersions} from '../src/migrations.ts';
import {DemoAccess,demoPassword,demoConfig} from '../src/demo/access.ts';
import {demoRoles,type DemoRole} from '../src/demo/roles.ts';
import {IntakeService,type IntakeActor} from '../src/intake/service.ts';
import {ClarificationService} from '../src/intake/clarifications.ts';
import {BookingService} from '../src/bookings/service.ts';
import {bindVerifiedSession,clearDemoSession,hasDemoSession,demoLease} from '../src/demo/session.ts';

// Real isolated PostgreSQL; trusted synthetic actors. These tests do not create
// managed Auth accounts, send emails, call a model, or authorize PayPal payments.
const schema=`demo_test_${randomUUID().replaceAll('-','')}`,base=process.env.TEST_DATABASE_URL??localDatabaseUrl;
const admin=database(base),url=new URL(base);url.searchParams.set('options',`-c search_path=${schema},public`);
const pool=database(url.toString()),peer=database(url.toString()),config={key:'a'.repeat(64),code:'synthetic-access-code-for-tests'};
const access=new DemoAccess(pool,config),other=new DemoAccess(peer,config),intake=new IntakeService(pool),bookings=new BookingService(pool);
const baseCatalog=JSON.parse(await readFile(new URL('../fixtures/studio.json',import.meta.url),'utf8'));
before(async()=>{await admin.query(`CREATE SCHEMA ${schema}`);for(const name of migrationVersions)await pool.query(await readFile(new URL(`../db/${name}.sql`,import.meta.url),'utf8'));});
after(async()=>{await pool.end();await peer.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();});
const pref={budgetMinor:5000,availableSlotIds:['thu-evening'],latestFinishAt:null,technique:'ANY',outcome:'FORM_OWN_CUP',collection:'SELF_LATER',nomineeMemberId:null,extraRequirement:'NONE',unresolvedKeys:[]};
async function workspace(ready=true){
 const id=randomUUID(),catalog={...baseCatalog,studioId:`demo-${id}`,versionId:`catalog-${id}`,
  slots:baseCatalog.slots.map((s:{id:string},i:number)=>({...s,startAt:new Date(Date.now()+(7+i)*86400000).toISOString()}))};
 await pool.query('INSERT INTO demo_workspaces(id,studio_id,catalog) VALUES($1,$2,$3)',[id,catalog.studioId,JSON.stringify(catalog)]);
 const actors={} as Record<DemoRole,IntakeActor>;
 for(const [role,name] of Object.entries(demoRoles)){
  const userId=randomUUID();actors[role as DemoRole]={userId,emailVerified:true,demoWorkspaceId:id};
  await pool.query('INSERT INTO demo_identities(workspace_id,role,user_id,email,display_name) VALUES($1,$2,$3,$4,$5)',[id,role,userId,`${role.toLowerCase()}.${id}@rally-demo.invalid`,name]);
 }
 const create={commandId:randomUUID(),targetSize:6,displayName:'Alex',catalog};
 const group=await intake.create(actors.ORGANIZER,create);
 await pool.query('UPDATE demo_workspaces SET group_id=$2,state=$3 WHERE id=$1',[id,group.groupId,ready?'AVAILABLE':'PROVISIONING']);
 return {id,catalog,actors,group,create};
}
async function reserve(){const w=await workspace(),commandId=randomUUID(),lease=await access.claim(commandId,config.code);assert.equal(lease.workspaceId,w.id);return {...w,commandId,lease};}

test('demo configuration is gated and derived passwords bind both workspace and role',()=>{
 const original={enabled:process.env.RALLY_DEMO_ENABLED,key:process.env.RALLY_DEMO_KEY,code:process.env.RALLY_DEMO_ACCESS_CODE};
 try{process.env.RALLY_DEMO_ENABLED='false';assert.throws(()=>demoConfig(),/DEMO_UNAVAILABLE/);
  process.env.RALLY_DEMO_ENABLED='true';process.env.RALLY_DEMO_KEY='short';process.env.RALLY_DEMO_ACCESS_CODE=config.code;assert.throws(()=>demoConfig(),/SETUP_REQUIRED/);
  process.env.RALLY_DEMO_KEY=config.key;assert.deepEqual(demoConfig(),config);
  const id=randomUUID(),password=demoPassword(config.key,id,'ORGANIZER');assert.equal(password,demoPassword(config.key,id,'ORGANIZER'));
  assert.notEqual(password,demoPassword(config.key,id,'TRAVELER'));assert.notEqual(password,demoPassword(config.key,randomUUID(),'ORGANIZER'));
 }finally{for(const [name,value] of Object.entries({RALLY_DEMO_ENABLED:original.enabled,RALLY_DEMO_KEY:original.key,RALLY_DEMO_ACCESS_CODE:original.code})){if(value===undefined)delete process.env[name];else process.env[name]=value;}}
});
test('only a valid private code claims a fully provisioned workspace',async()=>{
 const provisioning=await workspace(false),incomplete=await workspace();
 await pool.query("DELETE FROM demo_identities WHERE workspace_id=$1 AND role='FRIEND_THREE'",[incomplete.id]);
 await assert.rejects(access.claim(randomUUID(),'wrong-code'),/DEMO_CODE_REQUIRED/);
 await assert.rejects(access.claim(randomUUID(),config.code),/DEMO_FULL/);
 const states=(await pool.query('SELECT state FROM demo_workspaces WHERE id=ANY($1::uuid[])',[[provisioning.id,incomplete.id]])).rows;
 assert.deepEqual(states.map(r=>r.state).sort(),['AVAILABLE','PROVISIONING']);
 // Deliberately incomplete fixtures remain quarantined, never a judge lease.
 await pool.query("UPDATE demo_workspaces SET state='PROVISIONING' WHERE id=$1",[incomplete.id]);
});
test('concurrent claims across independent pools allocate each workspace once and retries survive restart',async()=>{
 const available=await Promise.all(Array.from({length:3},()=>workspace()));
 const results=await Promise.allSettled(Array.from({length:12},(_,i)=>(i%2?access:other).claim(randomUUID(),config.code)));
 const successful=results.filter(r=>r.status==='fulfilled');assert.equal(successful.length,3);
 const ids=successful.map(r=>r.value.workspaceId);assert.equal(new Set(ids).size,3);assert.deepEqual(ids.sort(),available.map(w=>w.id).sort());
 for(const r of results.filter(r=>r.status==='rejected'))assert.match(r.reason.message,/DEMO_FULL/);
 const w=await workspace(),commandId=randomUUID(),same=await Promise.all(Array.from({length:12},(_,i)=>(i%2?access:other).claim(commandId,config.code)));
 assert.ok(same.every(r=>r.workspaceId===w.id&&r.token===same[0].token&&r.expiresAt===same[0].expiresAt));
 const restarted=database(url.toString());try{assert.deepEqual(await new DemoAccess(restarted,config).claim(commandId,config.code),same[0]);}finally{await restarted.end();}
 assert.equal((await pool.query('SELECT count(*) FROM demo_workspaces WHERE lease_id=$1',[commandId])).rows[0].count,'1');
});
test('lease identity cannot bind another workspace; storage contains no token or derived password',async()=>{
 const a=await reserve(),b=await reserve(),identity=await access.identity(a.lease.token,'TRAVELER');
 assert.equal(identity.user_id,a.actors.TRAVELER.userId);assert.equal(identity.workspace.id,a.id);
 assert.equal((await access.bind(a.lease.token,a.actors.TRAVELER.userId)).role,'TRAVELER');
 await assert.rejects(access.bind(a.lease.token,b.actors.TRAVELER.userId),/DEMO_SESSION_REQUIRED/);
 await assert.rejects(access.identity(a.lease.token,'toString' as DemoRole),/INVALID_REQUEST/);
 await assert.rejects(access.workspace('0'.repeat(64)),/DEMO_SESSION_EXPIRED/);
 const stored=(await pool.query('SELECT * FROM demo_workspaces WHERE id=$1',[a.id])).rows[0];
 assert.equal(stored.lease_digest,createHash('sha256').update(a.lease.token).digest('hex'));assert.ok(!JSON.stringify(stored).includes(a.lease.token));
 await assert.rejects(access.workspace(stored.lease_digest),/DEMO_SESSION_EXPIRED/);
 assert.ok(!JSON.stringify((await pool.query('SELECT * FROM demo_identities WHERE workspace_id=$1',[a.id])).rows).includes(identity.password));
});
test('expired judge leases are rejected without recycling a group or extending its expiry',async()=>{
 const w=await reserve();await pool.query("UPDATE demo_workspaces SET leased_at=clock_timestamp()-interval '25 hours',expires_at=clock_timestamp()-interval '1 hour' WHERE id=$1",[w.id]);
 const prior=(await pool.query('SELECT group_id,expires_at,state FROM demo_workspaces WHERE id=$1',[w.id])).rows[0];
 await assert.rejects(access.claim(w.commandId,config.code),/DEMO_SESSION_EXPIRED/);await assert.rejects(access.bind(w.lease.token,w.actors.ORGANIZER.userId),/DEMO_SESSION_EXPIRED/);
 await assert.rejects(access.claim(randomUUID(),config.code),/DEMO_FULL/);
 assert.deepEqual((await pool.query('SELECT group_id,expires_at,state FROM demo_workspaces WHERE id=$1',[w.id])).rows[0],prior);assert.equal(prior.state,'LEASED');
});
test('a leaked invite and copied actor ID cannot cross normal or other judge workspace scope',async()=>{
 const a=await reserve(),b=await reserve(),plain={userId:randomUUID(),emailVerified:true};
 const normal=await intake.create(plain,{commandId:randomUUID(),targetSize:6,displayName:'Normal',catalog:baseCatalog});
 await assert.rejects(intake.join(plain,{commandId:randomUUID(),invite:a.group.invite,displayName:'Normal'}),/NOT_FOUND/);
 await assert.rejects(intake.join(b.actors.TRAVELER,{commandId:randomUUID(),invite:a.group.invite,displayName:'Other judge'}),/NOT_FOUND/);
 await assert.rejects(intake.join(a.actors.TRAVELER,{commandId:randomUUID(),invite:normal.invite,displayName:'Demo'}),/NOT_FOUND/);
 const stripped={userId:a.actors.ORGANIZER.userId,emailVerified:true},wrong={...a.actors.ORGANIZER,demoWorkspaceId:b.id};
 for(const actor of [stripped,wrong]){
  await assert.rejects(intake.participantContext(actor,a.group.groupId),/NOT_FOUND/);await assert.rejects(intake.roster(actor,a.group.groupId),/NOT_FOUND/);
  await assert.rejects(intake.ownPreferences(actor,a.group.groupId),/NOT_FOUND/);await assert.rejects(intake.collectionRequests(actor,a.group.groupId),/NOT_FOUND/);
  await assert.rejects(new ClarificationService(pool).view(actor,a.group.groupId),/NOT_FOUND/);
  await assert.rejects(intake.create(actor,a.create),/COMMAND_CONFLICT/);
 }
 assert.equal((await intake.participantContext(a.actors.ORGANIZER,a.group.groupId)).displayName,'Alex');
 const count=(await pool.query('SELECT count(*) FROM planning_groups')).rows[0].count;
 await assert.rejects(intake.create(a.actors.ORGANIZER,{...a.create,commandId:randomUUID(),catalog:baseCatalog}),/NOT_FOUND/);
 assert.equal((await pool.query('SELECT count(*) FROM planning_groups')).rows[0].count,count);
});
test('six synthetic friends keep private preferences and a distinct scoped studio must approve before any offer exists',async()=>{
 const a=await reserve(),b=await reserve(),roles=(Object.keys(demoRoles) as DemoRole[]).filter(r=>r!=='STUDIO');
 const memberIds=[a.group.memberId];let revision=0;
 for(const role of roles.slice(1)){const result=await intake.join(a.actors[role],{commandId:randomUUID(),invite:a.group.invite,displayName:demoRoles[role]});memberIds.push(result.memberId);revision=result.revision;}
 for(const [index,role] of roles.entries()){const saved=await intake.save(a.actors[role],{commandId:randomUUID(),groupId:a.group.groupId,expectedRevision:revision,expectedPreferenceId:null,preference:{...pref,budgetMinor:5000+index*100},optionalText:null});revision=saved.revision;}
 assert.equal((await intake.participantContext(a.actors.TRAVELER,a.group.groupId)).preference?.budgetMinor,5100);
 assert.ok(!JSON.stringify(await intake.roster(a.actors.ORGANIZER,a.group.groupId)).includes('budgetMinor'));
 revision=(await intake.closeRoster(a.actors.ORGANIZER,{commandId:randomUUID(),groupId:a.group.groupId,expectedRevision:revision,memberIds})).revision;
 await pool.query('INSERT INTO merchant_studios VALUES($1,$2,$3,$4,15,20)',[a.catalog.studioId,a.actors.STUDIO.userId,'synthetic_merchant',`resource-${a.id}`]);
 await pool.query('INSERT INTO merchant_catalog_versions(studio_id,version_id,catalog) VALUES($1,$2,$3)',[a.catalog.studioId,a.catalog.versionId,JSON.stringify(a.catalog)]);
 const request={commandId:randomUUID(),groupId:a.group.groupId,expectedRevision:revision,offeringId:'handbuild',slotId:'thu-evening'};
 await assert.rejects(bookings.request({...a.actors.ORGANIZER,demoWorkspaceId:b.id},request),/NOT_FOUND/);
 const r=await bookings.request(a.actors.ORGANIZER,request);assert.equal((await bookings.merchantQueue(a.actors.STUDIO)).requests.length,1);
 const stripped={userId:a.actors.STUDIO.userId,emailVerified:true};assert.equal((await bookings.merchantQueue(stripped)).requests.length,0);
 await assert.rejects(bookings.merchantRequest(b.actors.STUDIO,r.requestId),/NOT_FOUND/);await assert.rejects(bookings.merchantRequest(stripped,r.requestId),/NOT_FOUND/);
 assert.equal((await bookings.merchantRequest(a.actors.STUDIO,r.requestId)).state,'PENDING');
 const command={commandId:randomUUID(),requestId:r.requestId,expectedRevision:r.revision,factsConfirmed:true,externalCalendarBlocked:true,automaticSettlementAgreed:true,collectionArrangementsAgreed:true};
 await assert.rejects(bookings.approve(stripped,command),/NOT_FOUND/);
 assert.equal((await pool.query('SELECT count(*) FROM offers')).rows[0].count,'0');
 const approved=await bookings.approve(a.actors.STUDIO,command);
 assert.equal((await bookings.offer(a.actors.TRAVELER,approved.offerId)).booking,'OPEN');
 await assert.rejects(bookings.offer({userId:a.actors.TRAVELER.userId,emailVerified:true},approved.offerId),/NOT_FOUND/);
 assert.equal((await bookings.merchantBookings(stripped)).bookings.length,0);assert.equal((await bookings.merchantBookings(a.actors.STUDIO)).bookings.length,1);
 assert.equal((await pool.query('SELECT count(*) FROM payment_operations')).rows[0].count,'0');
});
test('judge migration supports empty up/down/up and refuses to erase populated workspaces',async()=>{
 await assert.rejects(transaction(pool,async c=>{await c.query(await readFile(new URL('../db/010_judge_workspaces.down.sql',import.meta.url),'utf8'));}),/Refuse to remove populated/);
 const empty=`demo_migration_${randomUUID().replaceAll('-','')}`;await admin.query(`CREATE SCHEMA ${empty}`);
 const location=new URL(base);location.searchParams.set('options',`-c search_path=${empty},public`);const disposable=database(location.toString());
 try{for(const name of ['004_private_intake','009_request_limits','010_judge_workspaces','010_judge_workspaces.down','010_judge_workspaces'])await disposable.query(await readFile(new URL(`../db/${name}.sql`,import.meta.url),'utf8'));
  assert.equal((await disposable.query('SELECT count(*) FROM demo_workspaces')).rows[0].count,'0');
  await assert.rejects(disposable.query("INSERT INTO demo_workspaces(id,studio_id,catalog,lease_id) VALUES($1,$2,'{}',$3)",[randomUUID(),'partial-lease',randomUUID()]),/check constraint/);
 }finally{await disposable.end();await admin.query(`DROP SCHEMA ${empty} CASCADE`);}
});
test('verified managed identity must match lease, trusted metadata and the document viewer',async()=>{
 const a=await reserve(),b=await reserve(),user={id:a.actors.ORGANIZER.userId,email_confirmed_at:new Date().toISOString(),app_metadata:{rally_demo:true,rally_workspace:a.id,rally_role:'ORGANIZER'}};
 const options={demo:true,token:a.lease.token,viewerId:user.id};
 assert.equal((await bindVerifiedSession(user,options,access)).actor.demoWorkspaceId,a.id);
 await assert.rejects(bindVerifiedSession(user,{demo:false}),/DEMO_SESSION_REQUIRED/);
 await assert.rejects(bindVerifiedSession({...user,email_confirmed_at:undefined},options,access),/VERIFIED_IDENTITY_REQUIRED/);
 for(const app_metadata of [{}, {...user.app_metadata,rally_workspace:b.id},{...user.app_metadata,rally_role:'TRAVELER'}])await assert.rejects(bindVerifiedSession({...user,app_metadata},options,access),/DEMO_SESSION_REQUIRED/);
 await assert.rejects(bindVerifiedSession(user,{...options,token:b.lease.token},access),/DEMO_SESSION_REQUIRED/);
 await assert.rejects(bindVerifiedSession(user,{...options,viewerId:a.actors.TRAVELER.userId},access),/VIEWER_CHANGED/);
 await assert.rejects(bindVerifiedSession(user,{...options,viewerId:null},access),/VIEWER_CHANGED/);
 assert.equal((await bindVerifiedSession(user,{...options,viewerId:null,requireViewer:false},access)).demo?.role,'ORGANIZER');
 assert.deepEqual((await bindVerifiedSession({...user,app_metadata:{}},{demo:false})).actor,{userId:user.id,emailVerified:true});
});
test('active role is a server-side compare-and-set; an old refreshed cookie cannot restore its authority',async()=>{
 const a=await reserve(),old=a.actors.ORGANIZER.userId,traveler=a.actors.TRAVELER.userId,collector=a.actors.COLLECTOR.userId;
 const changes=await Promise.allSettled([access.activate(a.lease.token,old,traveler),other.activate(a.lease.token,old,collector)]);
 assert.equal(changes.filter(r=>r.status==='fulfilled').length,1);assert.match((changes.find(r=>r.status==='rejected') as PromiseRejectedResult).reason.message,/VIEWER_CHANGED/);
 const current=await access.currentIdentity(a.lease.token);assert.ok([traveler,collector].includes(current.user_id));
 const stale={id:old,email_confirmed_at:new Date().toISOString(),app_metadata:{rally_demo:true,rally_workspace:a.id,rally_role:'ORGANIZER'}};
 await assert.rejects(bindVerifiedSession(stale,{demo:true,token:a.lease.token,viewerId:old},access),/VIEWER_CHANGED/);
 await assert.rejects(bindVerifiedSession(stale,{demo:true,token:a.lease.token,requireViewer:false},access),/VIEWER_CHANGED/);
 const fresh={id:current.user_id,email_confirmed_at:new Date().toISOString(),app_metadata:{rally_demo:true,rally_workspace:a.id,rally_role:current.role}};
 assert.equal((await bindVerifiedSession(fresh,{demo:true,token:a.lease.token,viewerId:current.user_id},access)).demo?.role,current.role);
 await assert.rejects(access.activate(a.lease.token,current.user_id,randomUUID()),/VIEWER_CHANGED/);
 await assert.rejects(transaction(pool,async c=>{await c.query(await readFile(new URL('../db/011_demo_active_identity.down.sql',import.meta.url),'utf8'));}),/Refuse to remove active/);
});
test('demo namespace detection fails closed and exit clears only its own lease and Auth chunks',()=>{
 const personal='sb-personal-auth-token',request=new Request('https://rally.example',{headers:{Cookie:`${personal}=synthetic-personal; rally-demo-auth.0=synthetic-demo; rally-demo-auth.1=synthetic-chunk; rally-demo-lease=${'a'.repeat(64)}; rally-auth-next=%2Fstudio`}});
 assert.equal(hasDemoSession(request),true);assert.equal(demoLease(request),'a'.repeat(64));
 assert.equal(hasDemoSession(new Request('https://rally.example',{headers:{Cookie:`${personal}=synthetic-personal`}})),false);
 assert.equal(hasDemoSession(new Request('https://rally.example',{headers:{Cookie:'rally-demo-auth.malformed=synthetic'}})),true);
 const response=clearDemoSession(request,Response.json({next:'/'})),cookies=response.headers.getSetCookie();
 assert.equal(cookies.length,4);assert.ok(cookies.every(c=>c.includes('Max-Age=0')&&c.includes('HttpOnly')&&c.includes('SameSite=Lax')));
 assert.ok(!cookies.some(c=>c.startsWith(personal+'=')||c.startsWith('rally-auth-next=')));
 assert.equal(response.headers.get('Cache-Control'),'private, no-store');
});
