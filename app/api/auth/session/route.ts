import {auth,verifiedActor} from '../../../../src/web/auth.ts';
import {errorResponse,WebError} from '../../../../src/web/security.ts';
export async function GET(request:Request){try{
 const a=auth(request);
 try{const actor=await verifiedActor(a.client);return a.finish(Response.json({signedIn:true,userId:actor.userId}));}
 catch(e){if(e instanceof WebError&&e.code==='SIGN_IN_REQUIRED')return a.finish(Response.json({signedIn:false}));return a.finish(errorResponse(e));}
 }catch(e){return errorResponse(e);}}
