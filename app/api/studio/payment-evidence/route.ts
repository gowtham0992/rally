import {auth} from '../../../../src/web/auth.ts';
import {bookings} from '../../../../src/web/services.ts';
import {body,errorResponse,sameOrigin} from '../../../../src/web/security.ts';
export async function GET(request:Request){try{
 const a=await auth(request),actor=await a.actor(),params=new URL(request.url).searchParams;
 return a.finish(Response.json(await bookings().merchantPaymentRecord(actor,params.get('operationId')??'',params.get('cursor'))));
}catch(e){return errorResponse(e);}}
export async function POST(request:Request){try{
 sameOrigin(request);const a=await auth(request),actor=await a.actor();
 return a.finish(Response.json(await bookings().recordMerchantPaymentEvidence(actor,await body(request))));
}catch(e){return errorResponse(e);}}
