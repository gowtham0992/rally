import {auth} from '../../../../src/web/auth.ts';
import {intake} from '../../../../src/web/services.ts';
import {sameOrigin,body,errorResponse} from '../../../../src/web/security.ts';
export async function POST(request:Request){try{sameOrigin(request);const a=await auth(request),actor=await a.actor();return a.finish(Response.json(await intake().join(actor,await body(request))));}catch(e){return errorResponse(e);}}
