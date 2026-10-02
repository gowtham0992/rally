import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {clarify} from '../src/ai/clarifier.ts';
const catalog=JSON.parse(await readFile(new URL('../fixtures/studio.json',import.meta.url),'utf8'));
const config={url:'https://gateway.example',key:'test-only-key',model:'test-model'};
test('AI proposal requires exact evidence and never receives budgets or tools',async()=>{
 const revisionId=randomUUID(),text='I can collect later.';let calls=0;
 const proposal={schemaVersion:1,preferenceRevisionId:revisionId,interpretations:[{requirementKey:'COLLECTION',proposedValue:'SELF_LATER',sourceStart:0,sourceEnd:text.length,sourceSpan:text,certainty:'explicit'}],question:null};
 const transport:typeof fetch=async(_url,init)=>{calls++;const body=JSON.parse(String(init?.body));assert.equal(body.tools,undefined);assert.equal(body.max_tokens,1400);const data=JSON.parse(body.messages[1].content);assert.equal(data.budgetMinor,undefined);assert.equal(data.members,undefined);return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(proposal)}}]});};
 assert.equal((await clarify({revisionId,text,catalog},config,transport)).status,'PROPOSAL');assert.equal(calls,1);
 proposal.interpretations[0].sourceSpan='I invented this';
 assert.deepEqual(await clarify({revisionId,text,catalog},config,transport),{status:'NEEDS_REVIEW'});
});
test('AI refusal, truncation, and oversized responses fail closed without retries',async()=>{
 const input={revisionId:randomUUID(),text:'I leave Friday.',catalog};
 for(const reply of [new Response('private provider error',{status:429}),Response.json({choices:[{finish_reason:'length',message:{content:'{}'}}]}),new Response('x'.repeat(24577))]){let calls=0;const transport:typeof fetch=async()=>{calls++;return reply;};assert.deepEqual(await clarify(input,config,transport),{status:'NEEDS_REVIEW'});assert.equal(calls,1);}
});

test('model character counts are grounded in a unique literal quote; repeated or absent quotes cannot be repaired',async()=>{
 const revisionId=randomUUID(),text='I can collect later.';
 const proposal={schemaVersion:1,preferenceRevisionId:revisionId,interpretations:[{requirementKey:'COLLECTION',proposedValue:'SELF_LATER',sourceStart:0,sourceEnd:999,sourceSpan:text,certainty:'explicit'}],question:null};
 const transport:typeof fetch=async()=>Response.json({choices:[{finish_reason:'stop',message:{content:'```json\n'+JSON.stringify(proposal)+'\n```'}}]});
 const result=await clarify({revisionId,text,catalog},config,transport);assert.equal(result.status,'PROPOSAL');
 if(result.status==='PROPOSAL')assert.equal(result.proposal.interpretations[0].sourceEnd,text.length);
 assert.deepEqual(await clarify({revisionId,text:text+' '+text,catalog},config,transport),{status:'NEEDS_REVIEW'});
});
