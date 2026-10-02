import {auth,verifiedActor} from '../../../../src/web/auth.ts';
import {bookings} from '../../../../src/web/services.ts';
import {errorResponse} from '../../../../src/web/security.ts';
export async function GET(request:Request,context:{params:Promise<{id:string}>}){try{const a=auth(request),actor=await verifiedActor(a.client),{id}=await context.params;return a.finish(Response.json(await bookings().offer(actor,id)));}catch(e){return errorResponse(e);}}
