import 'server-only';
import {createServerClient,serializeCookieHeader} from '@supabase/ssr';
import {WebError} from './security.ts';
import {requestLimiter} from './limits.ts';
import {DemoAccess,demoConfig} from '../demo/access.ts';
import {applicationDatabase} from './services.ts';
import {bindVerifiedSession,demoCookieName,demoLease,hasDemoSession,isDemoCookie,sessionCookies} from '../demo/session.ts';
export function demoAccess(){return new DemoAccess(applicationDatabase(),demoConfig());}
export async function auth(request:Request,options:{mode?:'normal'|'demo';bootstrap?:boolean}={}){
 const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_PUBLISHABLE_KEY;
 if(!url||!key)throw new WebError('SETUP_REQUIRED',503);
 await requestLimiter().reserve('PUBLIC_API','application');
 const demo=options.mode?options.mode==='demo':hasDemoSession(request);
 const pending:string[]=[];const headers:Record<string,string>={};
 const client=createServerClient(url,key,{
  cookieOptions:{...(demo?{name:demoCookieName,maxAge:86400}:{}),httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',path:'/'},
  cookies:{getAll:()=>sessionCookies(request).filter(c=>demo?isDemoCookie(c.name):!isDemoCookie(c.name)),
   setAll:(cookies,cacheHeaders)=>{for(const c of cookies)pending.push(serializeCookieHeader(c.name,c.value,c.options));Object.assign(headers,cacheHeaders);}}
 });
 let verified:ReturnType<typeof bindVerifiedSession>|undefined;
 function current(){return verified??= (async()=>{
  const {data,error}=await client.auth.getUser();
  if(error||!data.user)throw new WebError(demo?'DEMO_SESSION_EXPIRED':'SIGN_IN_REQUIRED',401);
  const result=await bindVerifiedSession(data.user,{demo,token:demoLease(request),viewerId:request.headers.get('X-Rally-Viewer'),requireViewer:!options.bootstrap},demo?demoAccess():undefined);
  await requestLimiter().reserve(request.method==='GET'?'ACTOR_READ':'ACTOR_WRITE',data.user.id);return result;
 })();}
 return {client,demoMode:demo,actor:async()=>(await current()).actor,demoSession:async()=>(await current()).demo,finish(response:Response){response.headers.set('Cache-Control','private, no-store');response.headers.set('Vary','Cookie');for(const [k,v] of Object.entries(headers))response.headers.set(k,v);for(const c of pending)response.headers.append('Set-Cookie',c);return response;}};
}
