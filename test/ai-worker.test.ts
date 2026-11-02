import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createAiWorker} from '../src/ai/worker.ts';
import {workerClarifier} from '../src/ai/worker-client.ts';
import type {clarify} from '../src/ai/clarifier.ts';
const catalog=JSON.parse(await readFile(new URL('../fixtures/studio.json',import.meta.url),'utf8')),token='a'.repeat(64);
const input={revisionId:randomUUID(),text:'I want to make my own cup.',catalog};
const proposal={schemaVersion:1 as const,preferenceRevisionId:input.revisionId,interpretations:[{requirementKey:'OUTCOME' as const,proposedValue:'FORM_OWN_CUP' as const,sourceStart:0,sourceEnd:input.text.length,sourceSpan:input.text,certainty:'explicit' as const}],question:null};
test('AI-only worker authenticates before dispatch and rejects private or invented fields',async()=>{
 let calls=0;const model:typeof clarify=async(...args)=>{calls++;assert.equal(args[4],true);assert.deepEqual(args[0],input);return {status:'PROPOSAL',proposal};};
 const server=createAiWorker({token,model});await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();if(!address||typeof address==='string')throw Error('LOCAL_SERVER');const origin=`http://127.0.0.1:${address.port}`;
 const request=(value:unknown,credential='Bearer '+token)=>fetch(origin+'/interpret',{method:'POST',headers:{Authorization:credential,'Content-Type':'application/json'},body:JSON.stringify(value)});
 try{
  assert.equal((await request({purpose:'DRAFT',input},'wrong')).status,403);assert.equal(calls,0);
  assert.equal((await request({purpose:'DRAFT',input:{...input,budgetMinor:1}})).status,400);assert.equal(calls,0);
  assert.equal((await request({purpose:'DRAFT',input,booking:'CONFIRMED'})).status,400);assert.equal(calls,0);
  const result=await request({purpose:'DRAFT',input});assert.equal(result.status,200);assert.deepEqual(await result.json(),{status:'PROPOSAL',proposal});assert.equal(calls,1);assert.equal(result.headers.get('cache-control'),'no-store');
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
test('worker bridge forwards only consented input and revalidates exact evidence and closed output',async()=>{
 let calls=0;const transport:typeof fetch=async(url,init)=>{calls++;assert.equal(url,'https://worker.example/interpret');assert.equal(init?.redirect,'error');const value=JSON.parse(String(init?.body));assert.deepEqual(value,{purpose:'DRAFT',input});return Response.json({status:'PROPOSAL',proposal});};
 const call=workerClarifier('DRAFT',{url:'https://worker.example',token},transport);assert.equal((await call(input)).status,'PROPOSAL');assert.equal(calls,1);
 const invalid=await call({...input,budgetMinor:50} as any);assert.equal(invalid.status,'NEEDS_REVIEW');assert.equal(calls,1);
 for(const response of [{status:'PROPOSAL',proposal,booking:'CONFIRMED'},{status:'PROPOSAL',proposal:{...proposal,preferenceRevisionId:randomUUID()}},{status:'PROPOSAL',proposal:{...proposal,interpretations:[{...proposal.interpretations[0],sourceSpan:'invented'}]}}]){
  assert.equal((await workerClarifier('DRAFT',{url:'https://worker.example',token},async()=>Response.json(response))(input)).status,'NEEDS_REVIEW');
 }
});
test('worker bridge refuses unsafe configuration, oversized responses and provider outages',async()=>{
 for(const url of ['http://worker.example','https://name:secret@worker.example','https://worker.example/?key=x','https://worker.example/arbitrary'])assert.throws(()=>workerClarifier('DRAFT',{url,token}));
 assert.throws(()=>workerClarifier('DRAFT',{url:'https://worker.example',token:'short'}));
 for(const response of [new Response('x'.repeat(24577)),new Response('private provider failure',{status:503})])assert.equal((await workerClarifier('DRAFT',{url:'https://worker.example',token},async()=>response)(input)).status,'NEEDS_REVIEW');
});
test('published studio contact is kept out of the existing AI worker protocol',async()=>{
 let calls=0;const call=workerClarifier('DRAFT',{url:'https://worker.example',token},async(_url,init)=>{calls++;const sent=JSON.parse(String(init?.body));assert.equal(sent.input.catalog.contact,undefined);assert.deepEqual(sent.input,input);return Response.json({status:'PROPOSAL',proposal});});
 assert.equal((await call({...input,catalog:{...input.catalog,contact:{email:'studio@example.invalid'}}})).status,'PROPOSAL');assert.equal(calls,1);
});
test('worker logs bounded failure metadata without note, credentials or provider bodies',async()=>{
 const logs:string[]=[];
 const model:typeof clarify=async(...args)=>{
  assert.equal(args[4],true);
  args[3]?.({stage:'PROVIDER',httpStatus:503,note:input.text,credential:token,response:'private provider body'} as any);
  return {status:'NEEDS_REVIEW'};
 };
 const server=createAiWorker({token,model,log:line=>logs.push(line)});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();if(!address||typeof address==='string')throw Error('LOCAL_SERVER');
 try{
  const r=await fetch(`http://127.0.0.1:${address.port}/interpret`,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({purpose:'DRAFT',input})});
  assert.deepEqual(await r.json(),{status:'NEEDS_REVIEW'});
  assert.deepEqual(logs.map(line=>JSON.parse(line)),[{event:'ai_inference_unavailable',stage:'PROVIDER',httpStatus:503}]);
  assert.equal(logs.join('').includes(input.text),false);assert.equal(logs.join('').includes(token),false);assert.equal(logs.join('').includes('private provider body'),false);
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
