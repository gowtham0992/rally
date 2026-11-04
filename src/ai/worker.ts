import {createServer} from 'node:http';
import {createHash,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {clarify,gatewayConfig} from './clarifier.ts';
import {interpretationInput} from '../planning/interpretation.ts';
import {draftStudioQuestion} from './studio-question.ts';
const failureMetadata=z.object({
 stage:z.enum(['INPUT','CONFIGURATION','NETWORK','PROVIDER','RESPONSE','VALIDATION','MODEL_REVIEW','WORKER_REQUEST','MODEL_RESULT']),
 httpStatus:z.number().int().min(100).max(599).optional(),
 validation:z.enum(['JSON','SCHEMA','EVIDENCE','QUESTION','OTHER']).optional()
});
export function createAiWorker(options:{token:string;model?:typeof clarify;questionModel?:typeof draftStudioQuestion;log?:(line:string)=>void}){
 if(!/^[a-f0-9]{64}$/.test(options.token))throw Error('WORKER_TOKEN_REQUIRED');
 const expected=createHash('sha256').update(`Bearer ${options.token}`).digest();let active=0;
 const diagnostic=(event:unknown)=>{
  // Strip every field except bounded error categories. Never log inputs,
  // credentials, exception strings or raw provider/model responses.
  const parsed=failureMetadata.safeParse(event);
  try{(options.log??console.warn)(JSON.stringify({event:'ai_inference_unavailable',...(parsed.success?parsed.data:{stage:'UNKNOWN'})}));}catch{}
 };
 return createServer(async(req,res)=>{
  const json=(status:number,value:unknown)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
  if(req.method==='GET'&&req.url==='/health'){json(200,{ready:true,questionDraftVersion:1});return;}
  const credential=req.headers.authorization??'';
  if(credential.length>256||!timingSafeEqual(createHash('sha256').update(credential).digest(),expected)){json(403,{error:'FORBIDDEN'});return;}
  if(req.method!=='POST'||req.url!=='/interpret'){json(404,{error:'NOT_FOUND'});return;}
  if(active>=4){json(503,{error:'BUSY'});return;}
  if(!req.headers['content-type']?.startsWith('application/json')){json(415,{error:'JSON_REQUIRED'});return;}
  active++;
  try{
   const chunks:Buffer[]=[];let bytes=0;
   for await(const chunk of req){bytes+=chunk.length;if(bytes>65536){json(413,{error:'REQUEST_TOO_LARGE'});req.destroy();return;}chunks.push(chunk);}
   const payload=z.strictObject({purpose:z.enum(['DRAFT','CLARIFICATION','QUESTION']),input:z.unknown()}).parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
   // Validate again at the service boundary. No user budgets, selections,
   // identity, peers, tools or payment commands are accepted by this contract.
   interpretationInput(payload.input);
   if(payload.purpose==='QUESTION'){
    let diagnosed=false;
    const result=await (options.questionModel??draftStudioQuestion)(payload.input as Parameters<typeof draftStudioQuestion>[0],undefined,fetch,event=>{diagnosed=true;diagnostic(event);});
    if(result.status==='NEEDS_REVIEW'&&!diagnosed)diagnostic({stage:'MODEL_RESULT'});json(200,result);return;
   }
   let diagnosed=false;
   const result=await (options.model??clarify)(payload.input,undefined,fetch,event=>{diagnosed=true;diagnostic(event);},payload.purpose==='DRAFT');
   if(result.status==='NEEDS_REVIEW'&&!diagnosed)diagnostic({stage:'MODEL_RESULT'});
   json(200,result);
  }catch{diagnostic({stage:'WORKER_REQUEST'});json(400,{error:'INTERPRETATION_UNAVAILABLE'});}
  finally{active--;}
 });
}
export function startAiWorker(){gatewayConfig();const server=createAiWorker({token:process.env.RALLY_AI_WORKER_TOKEN??''});server.requestTimeout=40000;server.headersTimeout=10000;server.listen(Number(process.env.PORT??80),'0.0.0.0');return server;}
