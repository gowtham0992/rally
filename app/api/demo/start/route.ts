import {z} from 'zod';
import {auth,demoAccess} from '../../../../src/web/auth.ts';
import {body,errorResponse,sameOrigin,WebError} from '../../../../src/web/security.ts';
import {requestLimiter} from '../../../../src/web/limits.ts';
import {bindVerifiedSession,setDemoLease} from '../../../../src/demo/session.ts';
export async function POST(request:Request){try{
 sameOrigin(request);const p=z.strictObject({commandId:z.uuid(),accessCode:z.string().min(1).max(128)}).parse(await body(request));
 const a=await auth(request,{mode:'demo'}),access=demoAccess();await requestLimiter().reserve('DEMO_ENTRY','application');
 const lease=await access.claim(p.commandId,p.accessCode),identity=await access.currentIdentity(lease.token);
 const login=await a.client.auth.signInWithPassword({email:identity.email,password:identity.password});
 if(login.error||!login.data.session)throw new WebError('DEMO_UNAVAILABLE',503);
 const verified=await a.client.auth.getUser(login.data.session.access_token);
 if(verified.error||!verified.data.user||verified.data.user.id!==identity.user_id)throw new WebError('DEMO_UNAVAILABLE',503);
 const result=await bindVerifiedSession(verified.data.user,{demo:true,token:lease.token,requireViewer:false},access);
 return setDemoLease(a.finish(Response.json({demo:result.demo,next:identity.role==='STUDIO'?'/studio':`/groups/${lease.groupId}`})),lease.token,lease.expiresAt);
 }catch(e){return errorResponse(e);}}
