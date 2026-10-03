import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {database} from '../src/db.ts';
import {demoRoles,type DemoRole} from '../src/demo/roles.ts';
import {demoConfig} from '../src/demo/access.ts';

// Explicit verification consumes one available local workspace. Never log cookies,
// passwords, access codes or private budgets. Uses actual managed Auth over HTTP.
const origin=process.env.APP_ORIGIN;
if(process.env.ENABLE_DEMO_HTTP_VERIFY!=='true'||origin!=='http://localhost:3001')throw new Error('LOCAL_DEMO_VERIFICATION_REQUIRED');
const config=demoConfig(),jar=new Map<string,string>();
let viewer:string|undefined;
let lastPath='',lastStatus=0,lastError='';
async function request(path:string,method='GET',value?:unknown,options:{cookies?:Map<string,string>;viewer?:string|null}={}){
 const cookies=options.cookies??jar,headers=new Headers({Origin:origin!,Cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join('; ')});
 const current=options.viewer===undefined?viewer:options.viewer;if(current)headers.set('X-Rally-Viewer',current);
 if(value!==undefined)headers.set('Content-Type','application/json');
 const r=await fetch(origin+path,{method,headers,body:value===undefined?undefined:JSON.stringify(value),redirect:'error',signal:AbortSignal.timeout(30000)});
 for(const c of r.headers.getSetCookie()){const pair=c.split(';')[0],i=pair.indexOf('='),name=pair.slice(0,i),data=pair.slice(i+1);if(/Max-Age=0(?:;|$)/i.test(c))cookies.delete(name);else cookies.set(name,data);}
 const payload=await r.json();lastPath=path;lastStatus=r.status;lastError=typeof payload.error==='string'?payload.error:'';return {status:r.status,body:payload};
}
async function session(){const r=await request('/api/auth/session','GET',undefined,{viewer:null});assert.equal(r.status,200);assert.equal(r.body.signedIn,true);viewer=r.body.userId;return r.body;}
const pool=database();
try{
 const initial=(await pool.query('SELECT count(*)::int AS workspaces,(SELECT count(*)::int FROM demo_identities) AS identities FROM demo_workspaces')).rows[0];
 assert.equal(initial.workspaces,5);assert.equal(initial.identities,35);
 const start=await request('/api/demo/start','POST',{commandId:randomUUID(),accessCode:config.code});assert.equal(start.status,200);
 let active=await session();assert.equal(active.demo.role,'ORGANIZER');
 const group=active.demo.groupId,workspace=active.demo.workspaceId;
 const oldCookies=new Map(jar),oldViewer=viewer;
 let own=await request(`/api/groups/${group}`);assert.equal(own.status,200);assert.equal(own.body.preference,null);assert.equal(own.body.members.length,6);
 // The roster projection never includes another friend's private fields.
 for(const m of own.body.members){assert.equal(Object.hasOwn(m,'preference'),false);assert.equal(Object.hasOwn(m,'budgetMinor'),false);}
 const results=[];const budgets:Partial<Record<DemoRole,number>>={COLLECTOR:6000,FRIEND_ONE:6500,FRIEND_TWO:7000,FRIEND_THREE:7500};
 for(const role of Object.keys(demoRoles) as DemoRole[]){
  const switched=await request('/api/demo/role','POST',{role});assert.equal(switched.status,200);active=await session();assert.equal(active.demo.role,role);assert.equal(active.demo.workspaceId,workspace);
  const response=await request(role==='STUDIO'?'/api/studio/requests':`/api/groups/${group}`);assert.equal(response.status,200);
  if(role!=='STUDIO'){assert.equal(response.body.displayName,demoRoles[role]);assert.equal(response.body.preference?.budgetMinor??null,budgets[role]??null);for(const m of response.body.members)assert.equal(Object.hasOwn(m,'preference'),false);}
  results.push({role,managedLogin:true,ownProjectionVerified:true});
 }
 const stale=await request(`/api/groups/${group}`,'GET',undefined,{viewer:oldViewer});assert.equal(stale.status,409);assert.equal(stale.body.error,'VIEWER_CHANGED');
 const replay=await request('/api/auth/session','GET',undefined,{cookies:oldCookies,viewer:null});assert.equal(replay.status,409);assert.equal(replay.body.error,'VIEWER_CHANGED');
 const restore=await request('/api/demo/restore','POST',undefined,{cookies:oldCookies,viewer:null});assert.equal(restore.status,200);assert.equal(restore.body.demo.role,'STUDIO');
 const ref=new URL(process.env.SUPABASE_URL!).hostname.split('.')[0],renamed=new Map([...jar].filter(([k])=>k.startsWith('rally-demo-auth')).map(([k,v])=>[k.replace('rally-demo-auth',`sb-${ref}-auth-token`),v]));
 const escape=await request('/api/auth/session','GET',undefined,{cookies:renamed,viewer:null});assert.equal(escape.status,403);assert.equal(escape.body.error,'DEMO_SESSION_REQUIRED');
 await request('/api/demo/role','POST',{role:'ORGANIZER'});active=await session();
 const foreign=(await pool.query('SELECT group_id FROM demo_workspaces WHERE id<>$1 LIMIT 1',[workspace])).rows[0].group_id;
 const cross=await request(`/api/groups/${foreign}`);assert.equal(cross.status,404);
 const absent=await request(`/api/groups/${group}`,'GET',undefined,{viewer:null});assert.equal(absent.status,409);
 const exit=await request('/api/demo/exit','POST');assert.equal(exit.status,200);assert.equal([...jar.keys()].some(k=>k.startsWith('rally-demo-')),false);
 const finished=await request('/api/auth/session');assert.equal(finished.status,200);assert.equal(finished.body.signedIn,false);
 await writeFile('evidence/web/judge-managed-sessions.json',JSON.stringify({observedAt:new Date().toISOString(),scope:'Actual Supabase managed Auth and local production HTTP server. Prepared fictional preferences; no emails, model calls, merchant approvals or payments.',supabasePlan:'Free',workspaces:5,registeredSyntheticIdentities:35,roles:results,staleDocumentHttp:stale.status,oldCookieBootstrapHttp:replay.status,restorePreservedCurrentRole:true,normalNamespaceEscapeHttp:escape.status,crossWorkspaceGroupHttp:cross.status,missingViewerHttp:absent.status,exitClearsDemoSession:true,browserRoleSwitchVerified:false},null,2)+'\n');
 console.log('Seven actual managed judge logins, private projections, stale-cookie denial, restore and exit verified.');
}catch(e){console.error(JSON.stringify({code:'DEMO_MANAGED_HTTP_PROOF_FAILED',path:lastPath,status:lastStatus,error:lastError,assertion:e instanceof assert.AssertionError?e.operator:undefined}));process.exitCode=1;}finally{await pool.end();}
