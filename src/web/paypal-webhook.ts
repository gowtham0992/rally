import {z} from 'zod';
import {webhookHeaders} from '../payments/webhook-signature.ts';
import {DomainError} from '../payments/types.ts';
import {errorResponse,rawJsonBody,WebError} from './security.ts';
export async function handlePayPalWebhook(request:Request,deps:{reserve:()=>Promise<unknown>;webhook:(headers:Record<string,string>,event:unknown,raw:Uint8Array)=>Promise<{duplicate:boolean}>}){
 try{
  // Provider signatures authenticate this route. Browser Origin/session headers
  // do not. Reject malformed signature envelopes before quota or network work.
  const headers=Object.fromEntries(request.headers);if(!webhookHeaders(headers).success)throw new WebError('INVALID_WEBHOOK_SIGNATURE',403);
  const {value,raw}=await rawJsonBody(request,256000);
  z.object({id:z.string().min(1).max(128),event_type:z.string().min(1).max(128),resource:z.object({id:z.string().min(1).max(128)})}).parse(value);
  await deps.reserve();
  return Response.json(await deps.webhook(headers,value,raw),{headers:{'Cache-Control':'no-store'}});
 }catch(e){
  if(e instanceof DomainError&&e.code==='INVALID_WEBHOOK_SIGNATURE')return errorResponse(new WebError(e.code,403));
  return errorResponse(e);
 }
}
