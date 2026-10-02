import {auth,verifiedActor} from '../../../../src/web/auth.ts';
import {intake} from '../../../../src/web/services.ts';
import {sameOrigin,body,errorResponse} from '../../../../src/web/security.ts';
export async function POST(request:Request){try{sameOrigin(request);const a=auth(request),actor=await verifiedActor(a.client);return a.finish(Response.json(await intake().join(actor,await body(request))));}catch(e){return errorResponse(e);}}
