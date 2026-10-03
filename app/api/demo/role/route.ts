import {z} from 'zod';
import {auth,demoAccess} from '../../../../src/web/auth.ts';
import {body,errorResponse,sameOrigin,WebError} from '../../../../src/web/security.ts';
import {requestLimiter} from '../../../../src/web/limits.ts';
import {demoRoles,type DemoRole} from '../../../../src/demo/roles.ts';
import {bindVerifiedSession,demoLease} from '../../../../src/demo/session.ts';
export async function POST(request:Request){try{
 sameOrigin(request);const p=z.strictObject({role:z.enum(Object.keys(demoRoles) as [DemoRole,...DemoRole[]])}).parse(await body(request));
 const a=await auth(request),previous=await a.actor();if(!a.demoMode)throw new WebError('DEMO_SESSION_REQUIRED',403);
 const token=demoLease(request)!;await requestLimiter().reserve('DEMO_SWITCH',(await a.demoSession())!.workspaceId);
 const access=demoAccess(),identity=await access.identity(token,p.role),login=await a.client.auth.signInWithPassword({email:identity.email,password:identity.password});
 if(login.error||!login.data.session)throw new WebError('DEMO_UNAVAILABLE',503);
 const verified=await a.client.auth.getUser(login.data.session.access_token);
 if(verified.error||!verified.data.user||verified.data.user.id!==identity.user_id)throw new WebError('DEMO_UNAVAILABLE',503);
 const result=await bindVerifiedSession(verified.data.user,{demo:true,token,requireViewer:false,requireActive:false},access);
 await access.activate(token,previous.userId,identity.user_id);
 return a.finish(Response.json({demo:result.demo,next:p.role==='STUDIO'?'/studio':`/groups/${identity.workspace.group_id}`}));
 }catch(e){return errorResponse(e);}}
