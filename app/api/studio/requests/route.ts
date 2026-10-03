import {auth} from '../../../../src/web/auth.ts';
import {bookings} from '../../../../src/web/services.ts';
import {errorResponse} from '../../../../src/web/security.ts';
export async function GET(request:Request){try{const a=await auth(request),actor=await a.actor(),cursor=new URL(request.url).searchParams.get('cursor');return a.finish(Response.json(await bookings().merchantQueue(actor,cursor)));}catch(e){return errorResponse(e);}}
