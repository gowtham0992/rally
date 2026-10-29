import {z} from 'zod';
import {interpretationInput,interpretationSchema,validateInterpretation} from '../planning/interpretation.ts';
import type {Clarification} from './clarifier.ts';
const responseSchema=z.discriminatedUnion('status',[z.strictObject({status:z.literal('PROPOSAL'),proposal:interpretationSchema}),z.strictObject({status:z.literal('NEEDS_REVIEW')})]);
export function workerClarifier(purpose:'DRAFT'|'CLARIFICATION',config={url:process.env.RALLY_AI_WORKER_URL??'',token:process.env.RALLY_AI_WORKER_TOKEN??''},transport:typeof fetch=fetch){
 const url=new URL(config.url);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/'||!/^[a-f0-9]{64}$/.test(config.token))throw Error('AI_WORKER_NOT_CONFIGURED');
 return async(input:{revisionId:string;text:string;catalog:unknown}):Promise<Clarification>=>{
  try{interpretationInput(input);const r=await transport(url.origin+'/interpret',{method:'POST',redirect:'error',signal:AbortSignal.timeout(35000),headers:{Authorization:`Bearer ${config.token}`,'Content-Type':'application/json'},body:JSON.stringify({purpose,input})});
   if(!r.ok)return {status:'NEEDS_REVIEW'};const reader=r.body?.getReader();if(!reader)return {status:'NEEDS_REVIEW'};let size=0;const chunks:Uint8Array[]=[];
   try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>24576)throw Error('RESPONSE_BOUND');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
   const result=responseSchema.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));return result.status==='PROPOSAL'?{status:'PROPOSAL',proposal:validateInterpretation(result.proposal,input)}:result;
  }catch{return {status:'NEEDS_REVIEW'};}
 };
}
