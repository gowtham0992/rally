import {auth,demoAccess} from '../../../../src/web/auth.ts';
import {sameOrigin,errorResponse,WebError} from '../../../../src/web/security.ts';
import {bindVerifiedSession,demoLease} from '../../../../src/demo/session.ts';
import {requestLimiter} from '../../../../src/web/limits.ts';
export async function POST(request:Request){try{
 sameOrigin(request);const token=demoLease(request);if(!token)throw new WebError('DEMO_SESSION_EXPIRED',401);
 const a=await auth(request,{mode:'demo'}),access=demoAccess(),identity=await access.currentIdentity(token);
 await requestLimiter().reserve('DEMO_SWITCH',identity.workspace.id);
 const login=await a.client.auth.signInWithPassword({email:identity.email,password:identity.password});
 if(login.error||!login.data.session)throw new WebError('DEMO_UNAVAILABLE',503);
 const verified=await a.client.auth.getUser(login.data.session.access_token);
 if(verified.error||!verified.data.user||verified.data.user.id!==identity.user_id)throw new WebError('DEMO_UNAVAILABLE',503);
 const result=await bindVerifiedSession(verified.data.user,{demo:true,token,requireViewer:false},access);
 return a.finish(Response.json({demo:result.demo,next:identity.role==='STUDIO'?'/studio':`/groups/${identity.workspace.group_id}`}));
 }catch(e){return errorResponse(e);}}
