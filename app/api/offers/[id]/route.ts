import {z} from 'zod';
import {auth} from '../../../../src/web/auth.ts';
import {bookings,payments} from '../../../../src/web/services.ts';
import {sameOrigin,body,errorResponse} from '../../../../src/web/security.ts';
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,context:Context){try{const a=await auth(request),actor=await a.actor(),{id}=await context.params,offer=await bookings().offer(actor,id);
 const payment=offer.isParticipant?await payments().participantStatus(id,actor.userId):null;
 return a.finish(Response.json({...offer,...(payment?{booking:payment.booking,paymentApprovalProgress:payment.paymentApprovalProgress}:{}),payment}));}catch(e){return errorResponse(e);}}
export async function POST(request:Request,context:Context){try{sameOrigin(request);const a=await auth(request),actor=await a.actor(),{id}=await context.params;z.uuid().parse(id);
 const p=z.discriminatedUnion('action',[
  z.strictObject({action:z.literal('ACCEPT'),commandId:z.uuid(),offerHash:z.string().length(64),agreesToOffer:z.literal(true)}),
  z.strictObject({action:z.literal('AUTHORIZE'),commandId:z.uuid(),offerHash:z.string().length(64)}),
  z.strictObject({action:z.literal('WITHDRAW'),commandId:z.uuid(),offerHash:z.string().length(64),agreesToWithdraw:z.literal(true)}),
  z.strictObject({action:z.literal('REQUEST_CANCELLATION'),commandId:z.uuid(),offerHash:z.string().length(64)}),
  z.strictObject({action:z.literal('MERCHANT_CANCEL'),commandId:z.uuid(),offerHash:z.string().length(64),agreesToFullRefund:z.literal(true)})
 ]).parse(await body(request));
 const command={commandId:p.commandId,offerId:id,actorId:actor.userId,offerHash:p.offerHash},engine=payments();
 const result=p.action==='ACCEPT'?await engine.accept(command):p.action==='AUTHORIZE'?await engine.authorize(command):p.action==='WITHDRAW'?await engine.withdraw(command):p.action==='REQUEST_CANCELLATION'?await engine.requestCancellation(command):await engine.cancelByMerchant({...command,agreesToFullRefund:p.agreesToFullRefund});
 return a.finish(Response.json(result));}catch(e){return errorResponse(e);}}
