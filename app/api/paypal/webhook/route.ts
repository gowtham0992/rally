import {handlePayPalWebhook} from '../../../../src/web/paypal-webhook.ts';
import {requestLimiter} from '../../../../src/web/limits.ts';
import {payments} from '../../../../src/web/services.ts';
export const runtime='nodejs';
export async function POST(request:Request){return handlePayPalWebhook(request,{
 reserve:()=>requestLimiter().reserve('PUBLIC_API','application'),
 webhook:(headers,event,raw)=>payments().webhook(headers,event,raw)
});}
