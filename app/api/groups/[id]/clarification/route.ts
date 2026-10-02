import {z} from 'zod';
import {auth,verifiedActor} from '../../../../../src/web/auth.ts';
import {clarifications} from '../../../../../src/web/services.ts';
import {sameOrigin,body,errorResponse,WebError} from '../../../../../src/web/security.ts';
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,context:Context){try{
 const a=auth(request),actor=await verifiedActor(a.client),{id}=await context.params;
 return a.finish(Response.json(await clarifications().view(actor,id)));
}catch(e){return errorResponse(e);}}
export async function POST(request:Request,context:Context){try{
 sameOrigin(request);const a=auth(request),actor=await verifiedActor(a.client),{id}=await context.params;z.uuid().parse(id);
 const p=z.strictObject({action:z.enum(['START','ANSWER','DECLINE','STRUCTURED']),payload:z.record(z.string(),z.unknown())}).parse(await body(request));
 if(p.payload.groupId!==id)throw new WebError('INVALID_REQUEST');const service=clarifications();
 const result=p.action==='STRUCTURED'?await service.confirmStructuredNote(actor,p.payload):p.action==='START'?await service.start(actor,p.payload):p.action==='ANSWER'?await service.answer(actor,p.payload):await service.decline(actor,p.payload);
 return a.finish(Response.json(result));
}catch(e){return errorResponse(e);}}
