import {auth} from '../../../../src/web/auth.ts';
import {studioQuestions} from '../../../../src/web/services.ts';
import {body,sameOrigin,errorResponse} from '../../../../src/web/security.ts';
export async function GET(request:Request){try{const a=await auth(request),actor=await a.actor();return a.finish(Response.json(await studioQuestions().inbox(actor,new URL(request.url).searchParams.get('cursor'))));}catch(e){return errorResponse(e);}}
export async function POST(request:Request){try{sameOrigin(request);const a=await auth(request),actor=await a.actor();return a.finish(Response.json(await studioQuestions().answer(actor,await body(request))));}catch(e){return errorResponse(e);}}
