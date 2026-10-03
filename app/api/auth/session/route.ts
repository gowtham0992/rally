import {auth} from '../../../../src/web/auth.ts';
import {errorResponse,WebError} from '../../../../src/web/security.ts';
export async function GET(request:Request){try{
 const a=await auth(request,{bootstrap:true});
 try{const actor=await a.actor();return a.finish(Response.json({signedIn:true,userId:actor.userId,demo:await a.demoSession()}));}
 catch(e){if(e instanceof WebError&&e.code==='SIGN_IN_REQUIRED')return a.finish(Response.json({signedIn:false}));return a.finish(errorResponse(e));}
 }catch(e){return errorResponse(e);}}
