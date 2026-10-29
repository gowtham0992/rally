import {z} from 'zod';
import {auth} from '../../../../../src/web/auth';
import {messageDrafts} from '../../../../../src/web/services';
import {sameOrigin,body,errorResponse,WebError} from '../../../../../src/web/security';
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,context:Context){try{const a=await auth(request),actor=await a.actor(),{id}=await context.params;return a.finish(Response.json(await messageDrafts().view(actor,id)));}catch(e){return errorResponse(e);}}
export async function POST(request:Request,context:Context){try{
 sameOrigin(request);const a=await auth(request),actor=await a.actor(),{id}=await context.params;z.uuid().parse(id);
 const p=await body(request);if(!p||typeof p!=='object'||p.groupId!==id)throw new WebError('INVALID_REQUEST');
 return a.finish(Response.json(await messageDrafts().start(actor,p)));
}catch(e){return errorResponse(e);}}
