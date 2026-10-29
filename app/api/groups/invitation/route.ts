import {z} from 'zod';
import {intake} from '../../../../src/web/services';
import {requestLimiter} from '../../../../src/web/limits';
import {sameOrigin,body,errorResponse} from '../../../../src/web/security';
const schema=z.strictObject({invite:z.string().regex(/^[a-f0-9]{64}$/)});
export async function POST(request:Request){try{
 sameOrigin(request);await requestLimiter().reserve('PUBLIC_API','application');
 const p=schema.parse(await body(request));
 return Response.json(await intake().invitationPreview(p.invite),{headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
}catch(e){return errorResponse(e);}}
