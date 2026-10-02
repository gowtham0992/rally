import {auth,verifiedActor} from '../../../../src/web/auth.ts';
import {bookings} from '../../../../src/web/services.ts';
import {errorResponse} from '../../../../src/web/security.ts';
export async function GET(request:Request){try{const a=auth(request),actor=await verifiedActor(a.client),cursor=new URL(request.url).searchParams.get('cursor');return a.finish(Response.json(await bookings().merchantQueue(actor,cursor)));}catch(e){return errorResponse(e);}}
