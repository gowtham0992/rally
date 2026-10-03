import {z} from 'zod';
import {auth,verifiedActor} from '../../../../src/web/auth.ts';
import {intake,bookings} from '../../../../src/web/services.ts';
import {sameOrigin,body,errorResponse,WebError} from '../../../../src/web/security.ts';
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,context:Context){try{const a=auth(request),actor=await verifiedActor(a.client),{id}=await context.params;return a.finish(Response.json(await intake().participantContext(actor,id)));}catch(e){return errorResponse(e);}}
export async function POST(request:Request,context:Context){try{sameOrigin(request);const a=auth(request),actor=await verifiedActor(a.client),{id}=await context.params;z.uuid().parse(id);
 const p=z.strictObject({action:z.enum(['SAVE','CLOSE','PLAN','CONSENT','REQUEST_OFFER','REOPEN']),payload:z.unknown()}).parse(await body(request));
 if(p.action==='PLAN'){if(p.payload!==null)throw new WebError('INVALID_REQUEST');return a.finish(Response.json(await intake().plan(actor,id)));}
 const payload=z.record(z.string(),z.unknown()).parse(p.payload);if(payload.groupId!==id)throw new WebError('INVALID_REQUEST');
 if(p.action==='REQUEST_OFFER')return a.finish(Response.json(await bookings().request(actor,payload)));
 if(p.action==='REOPEN')return a.finish(Response.json(await bookings().reopen(actor,payload)));
 const service=intake(),result=p.action==='SAVE'?await service.save(actor,payload):p.action==='CLOSE'?await service.closeRoster(actor,payload):await service.collectionConsent(actor,payload);
 return a.finish(Response.json(result));}catch(e){return errorResponse(e);}}
