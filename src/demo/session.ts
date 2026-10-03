import {parseCookieHeader,serializeCookieHeader} from '@supabase/ssr';
import type {IntakeActor} from '../intake/service.ts';
import {WebError} from '../web/security.ts';
import type {DemoAccess} from './access.ts';
export const demoCookieName='rally-demo-auth',demoLeaseCookie='rally-demo-lease';
export const isDemoCookie=(name:string)=>name===demoCookieName||name.startsWith(demoCookieName+'.')||name.startsWith(demoCookieName+'-');
export function sessionCookies(request:Request){return parseCookieHeader(request.headers.get('cookie')??'').filter((c):c is {name:string;value:string}=>typeof c.value==='string');}
export function hasDemoSession(request:Request){return sessionCookies(request).some(c=>c.name===demoLeaseCookie||isDemoCookie(c.name));}
export function demoLease(request:Request){return sessionCookies(request).find(c=>c.name===demoLeaseCookie)?.value;}
export function setDemoLease(response:Response,token:string,expiresAt:string){
 const maxAge=Math.max(0,Math.min(86400,Math.floor((Date.parse(expiresAt)-Date.now())/1000)));
 response.headers.append('Set-Cookie',serializeCookieHeader(demoLeaseCookie,token,{path:'/',httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',maxAge}));return response;
}
export function clearDemoSession(request:Request,response:Response){
 const names=new Set([demoCookieName,demoLeaseCookie,...sessionCookies(request).filter(c=>isDemoCookie(c.name)).map(c=>c.name)]);
 for(const name of names)response.headers.append('Set-Cookie',serializeCookieHeader(name,'',{path:'/',httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',maxAge:0}));
 response.headers.set('Cache-Control','private, no-store');response.headers.set('Vary','Cookie');return response;
}
export type VerifiedSessionUser={id:string;email_confirmed_at?:string;app_metadata:Record<string,unknown>};
export async function bindVerifiedSession(user:VerifiedSessionUser,options:{demo:boolean;token?:string;viewerId?:string|null;requireViewer?:boolean;requireActive?:boolean},access?:Pick<DemoAccess,'bind'>){
 if(!user.email_confirmed_at)throw new WebError('VERIFIED_IDENTITY_REQUIRED',403);
 if(options.viewerId&&options.viewerId!==user.id)throw new WebError('VIEWER_CHANGED',409);
 if(!options.demo){if(user.app_metadata.rally_demo===true)throw new WebError('DEMO_SESSION_REQUIRED',403);return {actor:{userId:user.id,emailVerified:true} as IntakeActor,demo:null};}
 if(!options.token||!access)throw new WebError('DEMO_SESSION_EXPIRED',401);
 const binding=await access.bind(options.token,user.id,options.requireActive!==false);
 if(user.app_metadata.rally_demo!==true||user.app_metadata.rally_workspace!==binding.workspaceId||user.app_metadata.rally_role!==binding.role)throw new WebError('DEMO_SESSION_REQUIRED',403);
 if(options.requireViewer!==false&&options.viewerId!==user.id)throw new WebError('VIEWER_CHANGED',409);
 return {actor:{userId:user.id,emailVerified:true,demoWorkspaceId:binding.workspaceId} as IntakeActor,demo:binding};
}
