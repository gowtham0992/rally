import {sameOrigin,errorResponse} from '../../../../src/web/security.ts';
import {clearDemoSession} from '../../../../src/demo/session.ts';
export async function POST(request:Request){try{sameOrigin(request);return clearDemoSession(request,Response.json({next:'/'}));}catch(e){return errorResponse(e);}}
