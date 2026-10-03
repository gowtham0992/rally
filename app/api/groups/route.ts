import {z} from 'zod';
import {auth} from '../../../src/web/auth.ts';
import {intake,publicCatalog} from '../../../src/web/services.ts';
import {sameOrigin,body,errorResponse} from '../../../src/web/security.ts';
import {requestLimiter} from '../../../src/web/limits.ts';
const schema=z.strictObject({commandId:z.uuid(),displayName:z.string().trim().min(1).max(60),targetSize:z.number().int().min(6).max(8)});
export async function POST(request:Request){try{sameOrigin(request);const a=await auth(request),actor=await a.actor();const p=schema.parse(await body(request));await requestLimiter().reserve('GROUP_CREATE',actor.userId);return a.finish(Response.json(await intake().create(actor,{...p,catalog:publicCatalog}),{status:201}));}catch(e){return errorResponse(e);}}
