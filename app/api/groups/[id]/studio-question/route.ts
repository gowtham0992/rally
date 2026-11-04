import {z} from 'zod';
import {auth} from '../../../../../src/web/auth.ts';
import {studioQuestions} from '../../../../../src/web/services.ts';
import {sameOrigin,body,errorResponse,WebError} from '../../../../../src/web/security.ts';
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,context:Context){try{const a=await auth(request),actor=await a.actor(),{id}=await context.params;return a.finish(Response.json(await studioQuestions().own(actor,id)));}catch(e){return errorResponse(e);}}
export async function POST(request:Request,context:Context){try{sameOrigin(request);const a=await auth(request),actor=await a.actor(),{id}=await context.params;z.uuid().parse(id);
 const {action,payload}=z.strictObject({action:z.enum(['ASK','ACCEPT','DRAFT']),payload:z.record(z.string(),z.unknown())}).parse(await body(request));if(payload.groupId!==id)throw new WebError('INVALID_REQUEST');
 const service=studioQuestions();return a.finish(Response.json(action==='ASK'?await service.ask(actor,payload):action==='DRAFT'?await service.draft(actor,payload):await service.accept(actor,payload)));}catch(e){return errorResponse(e);}}
