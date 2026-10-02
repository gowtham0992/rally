import {auth} from '../../../../src/web/auth.ts';
import {sameOrigin,errorResponse,WebError} from '../../../../src/web/security.ts';
export async function POST(request:Request){try{sameOrigin(request);const a=auth(request);const {error}=await a.client.auth.signOut({scope:'local'});if(error)throw new WebError('SIGN_OUT_UNAVAILABLE',503);return a.finish(Response.json({signedIn:false}));}catch(e){return errorResponse(e);}}
