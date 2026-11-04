import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {draftStudioQuestion,workerQuestionDrafter} from '../src/ai/studio-question.ts';
import {createAiWorker} from '../src/ai/worker.ts';
const catalog=JSON.parse(await readFile(new URL('../fixtures/studio.json',import.meta.url),'utf8')),input={revisionId:randomUUID(),text:'I need step-free access to the work area.',catalog};
const draft={schemaVersion:1 as const,preferenceRevisionId:input.revisionId,sourceStart:0,sourceEnd:input.text.length,sourceSpan:input.text},config={url:'https://gateway.example',key:'fictional-test-only',model:'test-model'},token='a'.repeat(64);
test('question gateway sends only the consented note and public facts with a bounded independent contract',async()=>{
 let calls=0;const result=await draftStudioQuestion({...input,catalog:{...catalog,contact:{email:'private@example.invalid'}}},config,async(_url,init)=>{calls++;const p=JSON.parse(String(init?.body)),data=JSON.parse(p.messages[1].content);assert.equal(p.max_tokens,600);assert.equal(data.optionalParticipantWording,input.text);assert.equal(data.slots,undefined);assert.equal(data.contact,undefined);assert.equal(data.budgetMinor,undefined);assert.ok(p.messages[0].content.includes('Never infer or promise safety'));return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(draft)}}]});});assert.equal(result.status,'QUESTION_DRAFT');assert.equal(calls,1);
 for(const value of [{...draft,sourceSpan:'Invented accessibility.'},{...draft,booking:'CONFIRMED'},{...draft,preferenceRevisionId:randomUUID()}])assert.equal((await draftStudioQuestion(input,config,async()=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}]}))).status,'NEEDS_REVIEW');
 assert.equal((await draftStudioQuestion(input,config,async()=>{throw Error('offline');})).status,'NEEDS_REVIEW');
});
test('QUESTION worker purpose preserves bearer protection and never dispatches malformed or private form fields',async()=>{
 let calls=0;const server=createAiWorker({token,questionModel:async value=>{calls++;assert.deepEqual(value,input);return {status:'QUESTION_DRAFT',draft};}});await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address();if(!address||typeof address==='string')throw Error('LOCAL_SERVER');const origin=`http://127.0.0.1:${address.port}`;
 const send=(value:unknown,auth='Bearer '+token)=>fetch(origin+'/interpret',{method:'POST',headers:{Authorization:auth,'Content-Type':'application/json'},body:JSON.stringify(value)});
 try{assert.equal((await send({purpose:'QUESTION',input},'bad')).status,403);assert.equal((await send({purpose:'QUESTION',input:{...input,budgetMinor:7500}})).status,400);assert.equal(calls,0);assert.deepEqual(await (await send({purpose:'QUESTION',input})).json(),{status:'QUESTION_DRAFT',draft});assert.equal(calls,1);}finally{await new Promise<void>(r=>server.close(()=>r()));}
});
test('question worker bridge revalidates evidence and fails closed on outages and added fields',async()=>{
 const call=workerQuestionDrafter({url:'https://worker.example',token},async(_url,init)=>{const p=JSON.parse(String(init?.body));assert.equal(p.purpose,'QUESTION');assert.equal(p.input.catalog.contact,undefined);return Response.json({status:'QUESTION_DRAFT',draft});});assert.equal((await call(input)).status,'QUESTION_DRAFT');
 for(const result of [{status:'QUESTION_DRAFT',draft:{...draft,sourceSpan:'not in the note'}},{status:'QUESTION_DRAFT',draft,booking:'CONFIRMED'}])assert.equal((await workerQuestionDrafter({url:'https://worker.example',token},async()=>Response.json(result))(input)).status,'NEEDS_REVIEW');
});
