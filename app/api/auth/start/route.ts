import {z} from 'zod';
import {serializeCookieHeader} from '@supabase/ssr';
import {auth} from '../../../../src/web/auth.ts';
import {appOrigin,body,errorResponse,safeNext,sameOrigin,WebError} from '../../../../src/web/security.ts';
export async function POST(request:Request){try{
 sameOrigin(request);const p=z.strictObject({email:z.email().max(254),next:z.string().max(512).optional()}).parse(await body(request));
 const a=auth(request),callback=new URL('/auth/callback',appOrigin());
 const {error}=await a.client.auth.signInWithOtp({email:p.email,options:{emailRedirectTo:callback.toString()}});
 if(error)throw new WebError(error.status===429?'EMAIL_RATE_LIMIT':'EMAIL_UNAVAILABLE',error.status===429?429:503);
 const response=a.finish(Response.json({state:'CHECK_EMAIL'}));
 response.headers.append('Set-Cookie',serializeCookieHeader('rally-auth-next',safeNext(p.next),{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',path:'/auth',maxAge:600}));
 return response;
 }catch(e){return errorResponse(e);}}
