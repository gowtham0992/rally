import {parseCookieHeader,serializeCookieHeader} from '@supabase/ssr';
import {auth} from '../../../src/web/auth.ts';
import {appOrigin,safeNext,errorResponse} from '../../../src/web/security.ts';
export async function GET(request:Request){try{
 const params=new URL(request.url).searchParams,a=await auth(request,{mode:'normal'});const code=params.get('code');
 const next=safeNext(parseCookieHeader(request.headers.get('cookie')??'').find(c=>c.name==='rally-auth-next')?.value);
 const finish=(r:Response)=>{r.headers.append('Set-Cookie',serializeCookieHeader('rally-auth-next','',{path:'/auth',maxAge:0,httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production'}));return a.finish(r);};
 if(code){const {error}=await a.client.auth.exchangeCodeForSession(code);if(!error)return finish(new Response(null,{status:303,headers:{Location:new URL(next,appOrigin()).toString()}}));}
 return finish(new Response(null,{status:303,headers:{Location:new URL('/login?error=expired',appOrigin()).toString()}}));
}catch(e){return errorResponse(e);}}
