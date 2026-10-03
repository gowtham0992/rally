import {auth,verifiedActor} from '../../../../src/web/auth.ts';
import {bookings} from '../../../../src/web/services.ts';
import {errorResponse} from '../../../../src/web/security.ts';
export async function GET(request:Request){try{const a=auth(request),actor=await verifiedActor(a.client);return a.finish(Response.json(await bookings().merchantBookings(actor,new URL(request.url).searchParams.get('cursor'))));}catch(e){return errorResponse(e);}}
