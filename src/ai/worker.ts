import {createServer} from 'node:http';
import {createHash,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {clarify,gatewayConfig} from './clarifier.ts';
import {interpretationInput} from '../planning/interpretation.ts';
export function createAiWorker(options:{token:string;model?:typeof clarify}){
 if(!/^[a-f0-9]{64}$/.test(options.token))throw Error('WORKER_TOKEN_REQUIRED');
 const expected=createHash('sha256').update(`Bearer ${options.token}`).digest();let active=0;
 return createServer(async(req,res)=>{
  const json=(status:number,value:unknown)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
  if(req.method==='GET'&&req.url==='/health'){json(200,{ready:true});return;}
  const credential=req.headers.authorization??'';
  if(credential.length>256||!timingSafeEqual(createHash('sha256').update(credential).digest(),expected)){json(403,{error:'FORBIDDEN'});return;}
  if(req.method!=='POST'||req.url!=='/interpret'){json(404,{error:'NOT_FOUND'});return;}
  if(active>=4){json(503,{error:'BUSY'});return;}
  if(!req.headers['content-type']?.startsWith('application/json')){json(415,{error:'JSON_REQUIRED'});return;}
  active++;
  try{
   const chunks:Buffer[]=[];let bytes=0;
   for await(const chunk of req){bytes+=chunk.length;if(bytes>65536){json(413,{error:'REQUEST_TOO_LARGE'});req.destroy();return;}chunks.push(chunk);}
   const payload=z.strictObject({purpose:z.enum(['DRAFT','CLARIFICATION']),input:z.unknown()}).parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
   // Validate again at the service boundary. No user budgets, selections,
   // identity, peers, tools or payment commands are accepted by this contract.
   interpretationInput(payload.input);
   const result=await (options.model??clarify)(payload.input,undefined,fetch,undefined,payload.purpose==='DRAFT');
   json(200,result);
  }catch{json(400,{error:'INTERPRETATION_UNAVAILABLE'});}
  finally{active--;}
 });
}
export function startAiWorker(){gatewayConfig();const server=createAiWorker({token:process.env.RALLY_AI_WORKER_TOKEN??''});server.requestTimeout=40000;server.headersTimeout=10000;server.listen(Number(process.env.PORT??80),'0.0.0.0');return server;}
