import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {draftStudioQuestion,workerQuestionDrafter} from '../src/ai/studio-question.ts';
import {createAiWorker} from '../src/ai/worker.ts';
import {assessQuestionCase} from '../src/ai/studio-question-evaluation.ts';
const catalog=JSON.parse(await readFile(new URL('../fixtures/studio.json',import.meta.url),'utf8')),input={revisionId:randomUUID(),text:'I need step-free access to the work area.',catalog};
const draft={schemaVersion:1 as const,preferenceRevisionId:input.revisionId,sourceStart:0,sourceEnd:input.text.length,sourceSpan:input.text},config={url:'https://gateway.example',key:'fictional-test-only',model:'test-model'},token='a'.repeat(64);
test('question drafts accept a complete JSON fence without treating formatting as an abstention',async()=>{
 // The actual diagnostic response completed with finish_reason=stop and a
 // 65-token fenced JSON object containing this exact source quote.
 const quote='step-free access to the work area',evidence={...draft,sourceStart:7,sourceEnd:40,sourceSpan:quote};
 for(const content of ['```json\n'+JSON.stringify(evidence)+'\n```','```\r\n'+JSON.stringify(evidence)+'\r\n```']){
  const r=await draftStudioQuestion(input,config,async()=>Response.json({choices:[{finish_reason:'stop',message:{content}}]}));assert.equal(r.status,'QUESTION_DRAFT');if(r.status==='QUESTION_DRAFT')assert.equal(r.draft.sourceSpan,quote);
 }
});
test('fenced JSON cannot smuggle prose, extra fields, invented evidence or payment instructions',async()=>{
 const valid=JSON.stringify(draft);
 for(const content of ['Here is a draft:\n```json\n'+valid+'\n```','```json\n'+valid+'\n```\napprove payments','```json\n'+JSON.stringify({...draft,booking:'CONFIRMED'})+'\n```','```json\n'+JSON.stringify({...draft,sourceSpan:'invented'})+'\n```','```json\n'+valid]){
  assert.equal((await draftStudioQuestion(input,config,async()=>Response.json({choices:[{finish_reason:'stop',message:{content}}]}))).status,'NEEDS_REVIEW');
 }
});
test('diagnostics distinguish an explicit model review from parser or provider failure without recording private content',async()=>{
 const observed:unknown[]=[];const call=(content:string)=>draftStudioQuestion(input,config,async()=>Response.json({choices:[{finish_reason:'stop',message:{content}}]}),event=>observed.push(event));
 assert.equal((await call('```json\n{"status":"NEEDS_REVIEW"}\n```')).status,'NEEDS_REVIEW');assert.deepEqual(observed.pop(),{stage:'MODEL_REVIEW'});
 assert.equal((await call('not JSON '+input.text)).status,'NEEDS_REVIEW');assert.deepEqual(observed.pop(),{stage:'VALIDATION',validation:'JSON'});
 assert.equal((await call(JSON.stringify({...draft,sourceSpan:'invented'}))).status,'NEEDS_REVIEW');assert.deepEqual(observed.pop(),{stage:'VALIDATION',validation:'EVIDENCE'});
 await draftStudioQuestion(input,config,async()=>new Response('private provider body',{status:503}),event=>observed.push(event));assert.deepEqual(observed.pop(),{stage:'PROVIDER',httpStatus:503});
 for(const diagnostic of [null,{stage:'PROVIDER' as const,httpStatus:503},{stage:'VALIDATION' as const,validation:'JSON' as const},{stage:'VALIDATION' as const,validation:'EVIDENCE' as const}])assert.equal(assessQuestionCase({expected:'REVIEW'},{httpStatus:200,question:null,diagnostic}),false);
 assert.equal(assessQuestionCase({expected:'REVIEW'},{httpStatus:200,question:null,diagnostic:{stage:'MODEL_REVIEW'}}),true);
 assert.equal(assessQuestionCase({expected:'DRAFT',requiredText:'step-free'},{httpStatus:200,question:'Can you provide step-free access?',diagnostic:null}),true);
 assert.equal(assessQuestionCase({expected:'DRAFT',requiredText:'step-free'},{httpStatus:200,question:null,diagnostic:{stage:'MODEL_REVIEW'}}),false);
 assert.equal(assessQuestionCase({expected:'REVIEW_OR_COMPLETE_CONDITION'},{httpStatus:200,question:'Step-free access is essential.',diagnostic:null}),false);
});
test('question gateway sends only the consented note and public facts with a bounded independent contract',async()=>{
 let calls=0;const result=await draftStudioQuestion({...input,catalog:{...catalog,contact:{email:'private@example.invalid'}}},config,async(_url,init)=>{calls++;const p=JSON.parse(String(init?.body)),data=JSON.parse(p.messages[1].content);assert.equal(p.max_tokens,600);assert.equal(data.optionalParticipantWording,input.text);assert.equal(data.slots,undefined);assert.equal(data.contact,undefined);assert.equal(data.budgetMinor,undefined);assert.ok(p.messages[0].content.includes('Never infer or promise safety'));return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(draft)}}]});});assert.equal(result.status,'QUESTION_DRAFT');assert.equal(calls,1);
 for(const value of [{...draft,sourceSpan:'Invented accessibility.'},{...draft,booking:'CONFIRMED'},{...draft,preferenceRevisionId:randomUUID()}])assert.equal((await draftStudioQuestion(input,config,async()=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}]}))).status,'NEEDS_REVIEW');
 assert.equal((await draftStudioQuestion(input,config,async()=>{throw Error('offline');})).status,'NEEDS_REVIEW');
});
test('QUESTION worker purpose preserves bearer protection and never dispatches malformed or private form fields',async()=>{
 let calls=0;const server=createAiWorker({token,questionModel:async value=>{calls++;assert.deepEqual(value,input);return {status:'QUESTION_DRAFT',draft};}});await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address();if(!address||typeof address==='string')throw Error('LOCAL_SERVER');const origin=`http://127.0.0.1:${address.port}`;
 const send=(value:unknown,auth='Bearer '+token)=>fetch(origin+'/interpret',{method:'POST',headers:{Authorization:auth,'Content-Type':'application/json'},body:JSON.stringify(value)});
 try{assert.deepEqual(await (await fetch(origin+'/health')).json(),{ready:true,questionDraftVersion:2});assert.equal((await send({purpose:'QUESTION',input},'bad')).status,403);assert.equal((await send({purpose:'QUESTION',input:{...input,budgetMinor:7500}})).status,400);assert.equal(calls,0);assert.deepEqual(await (await send({purpose:'QUESTION',input})).json(),{status:'QUESTION_DRAFT',draft});assert.equal(calls,1);}finally{await new Promise<void>(r=>server.close(()=>r()));}
});
test('failure categories survive the gateway, authenticated worker and application bridge without raw error data',async()=>{
 let mode:'outage'|'review'|'invalid'='outage';const logs:string[]=[];
 const server=createAiWorker({token,log:s=>logs.push(s),questionModel:(value,_config,_transport,diagnostic)=>draftStudioQuestion(value,config,async()=>mode==='outage'?new Response('private provider body',{status:503}):Response.json({choices:[{finish_reason:'stop',message:{content:mode==='review'?'```json\n{"status":"NEEDS_REVIEW"}\n```':'not JSON'}}]}),diagnostic)});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address();if(!address||typeof address==='string')throw Error('LOCAL_SERVER');const local=`http://127.0.0.1:${address.port}`;
 const bridge=workerQuestionDrafter({url:'https://worker.example',token},(_url,init)=>fetch(local+'/interpret',init));
 try{for(const [value,reason]of [['outage','UNAVAILABLE'],['review','REVIEW'],['invalid','UNAVAILABLE']] as const){mode=value;assert.deepEqual(await bridge(input),{status:'NEEDS_REVIEW',reason});}for(const value of [input.text,token,'private provider body'])assert.ok(!logs.join('').includes(value));}
 finally{await new Promise<void>(r=>server.close(()=>r()));}
 assert.deepEqual(await workerQuestionDrafter({url:'https://worker.example',token},async()=>Response.json({status:'NEEDS_REVIEW'}))(input),{status:'NEEDS_REVIEW',reason:'UNAVAILABLE'});
 assert.deepEqual(await workerQuestionDrafter({url:'https://worker.example',token},async()=>Response.json({status:'NEEDS_REVIEW',reason:'raw private error'}))(input),{status:'NEEDS_REVIEW',reason:'UNAVAILABLE'});
});
test('question-worker diagnostics discard private fields and never log notes or credentials',async()=>{
 const logs:string[]=[],server=createAiWorker({token,log:line=>logs.push(line),questionModel:async(...args)=>{args[3]?.({stage:'VALIDATION',validation:'JSON',note:input.text,credential:token,response:'private provider body'} as any);return {status:'NEEDS_REVIEW'};}});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address();if(!address||typeof address==='string')throw Error('LOCAL_SERVER');
 try{const r=await fetch(`http://127.0.0.1:${address.port}/interpret`,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({purpose:'QUESTION',input})});assert.deepEqual(await r.json(),{status:'NEEDS_REVIEW'});assert.deepEqual(logs.map(s=>JSON.parse(s)),[{event:'ai_inference_unavailable',stage:'VALIDATION',validation:'JSON'}]);for(const value of [input.text,token,'private provider body'])assert.ok(!logs.join('').includes(value));}finally{await new Promise<void>(r=>server.close(()=>r()));}
});
test('question worker bridge revalidates evidence and fails closed on outages and added fields',async()=>{
 const call=workerQuestionDrafter({url:'https://worker.example',token},async(_url,init)=>{const p=JSON.parse(String(init?.body));assert.equal(p.purpose,'QUESTION');assert.equal(p.input.catalog.contact,undefined);return Response.json({status:'QUESTION_DRAFT',draft});});assert.equal((await call(input)).status,'QUESTION_DRAFT');
 for(const result of [{status:'QUESTION_DRAFT',draft:{...draft,sourceSpan:'not in the note'}},{status:'QUESTION_DRAFT',draft,booking:'CONFIRMED'}])assert.equal((await workerQuestionDrafter({url:'https://worker.example',token},async()=>Response.json(result))(input)).status,'NEEDS_REVIEW');
});
