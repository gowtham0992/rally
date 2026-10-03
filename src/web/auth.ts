import 'server-only';
import {createServerClient,parseCookieHeader,serializeCookieHeader} from '@supabase/ssr';
import type {IntakeActor} from '../intake/service.ts';
import {WebError} from './security.ts';
import {requestLimiter} from './limits.ts';
export async function auth(request:Request){
 const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_PUBLISHABLE_KEY;
 if(!url||!key)throw new WebError('SETUP_REQUIRED',503);
 await requestLimiter().reserve('PUBLIC_API','application');
 const pending:string[]=[];const headers:Record<string,string>={};
 const client=createServerClient(url,key,{
  cookieOptions:{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',path:'/'},
  cookies:{getAll:()=>parseCookieHeader(request.headers.get('cookie')??'').filter((x):x is {name:string;value:string}=>typeof x.value==='string'),
   setAll:(cookies,cacheHeaders)=>{for(const c of cookies)pending.push(serializeCookieHeader(c.name,c.value,c.options));Object.assign(headers,cacheHeaders);}}
 });
 return {client,actor:()=>verifiedActor(client,request.method),finish(response:Response){response.headers.set('Cache-Control','private, no-store');response.headers.set('Vary','Cookie');for(const [k,v] of Object.entries(headers))response.headers.set(k,v);for(const c of pending)response.headers.append('Set-Cookie',c);return response;}};
}
async function verifiedActor(client:ReturnType<typeof createServerClient>,method:string):Promise<IntakeActor>{
 const {data,error}=await client.auth.getUser();
 if(error||!data.user)throw new WebError('SIGN_IN_REQUIRED',401);
 if(!data.user.email_confirmed_at)throw new WebError('VERIFIED_IDENTITY_REQUIRED',403);
 await requestLimiter().reserve(method==='GET'?'ACTOR_READ':'ACTOR_WRITE',data.user.id);
 return {userId:data.user.id,emailVerified:true};
}
