import {z} from 'zod';
import {auth} from '../../../../../src/web/auth.ts';
import {bookings} from '../../../../../src/web/services.ts';
import {sameOrigin,body,errorResponse,WebError} from '../../../../../src/web/security.ts';
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,context:Context){try{const a=await auth(request),actor=await a.actor(),{id}=await context.params;return a.finish(Response.json(await bookings().merchantRequest(actor,id)));}catch(e){return errorResponse(e);}}
export async function POST(request:Request,context:Context){try{sameOrigin(request);const a=await auth(request),actor=await a.actor(),{id}=await context.params;z.uuid().parse(id);
 const payload=z.record(z.string(),z.unknown()).parse(await body(request));if(payload.requestId!==id)throw new WebError('INVALID_REQUEST');const {action,...decision}=payload;return a.finish(Response.json(action==='DECLINE'?await bookings().decline(actor,decision):await bookings().approve(actor,payload)));}catch(e){return errorResponse(e);}}
