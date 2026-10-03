import test from 'node:test';
import assert from 'node:assert/strict';
import type {Clarification} from '../src/ai/clarifier.ts';
import {evaluationFixtures,fixtureContext,type EvaluationFixture} from '../src/ai/evaluation-fixtures.ts';
import {assessClarification,checkBaseline} from '../src/ai/evaluation.ts';
import {reviewProposal} from '../src/planning/meaning.ts';

function authoredResponse(f:EvaluationFixture):Clarification{
 if(f.mustReview)return {status:'NEEDS_REVIEW'};
 const c=fixtureContext(f),interpretations:any[]=[];
 const keys:Record<string,string>={technique:'TECHNIQUE',outcome:'OUTCOME',collection:'COLLECTION'};
 for(const [key,value] of Object.entries(f.confirmed??{})){
  if(keys[key])interpretations.push({requirementKey:keys[key],proposedValue:value,sourceStart:0,sourceEnd:f.text.length,sourceSpan:f.text,certainty:'explicit'});
  if(key==='availableSlotIds')interpretations.push({requirementKey:'TRAVEL',proposedValue:'CANNOT_ATTEND',sourceStart:0,sourceEnd:f.text.length,sourceSpan:f.text,certainty:'explicit'});
 }
 let question:any=null;
 if(f.question){
  const key=f.question.replace('_INTENT','').replace('_MEANING','');
  const alternative=key==='TRAVEL'?'CANNOT_ATTEND':key==='TECHNIQUE'?'WHEEL':key==='OUTCOME'?'DECORATE_EXISTING':'SAME_DAY_REQUIRED';
  for(let i=interpretations.length-1;i>=0;i--)if(interpretations[i].requirementKey===key||key==='TRAVEL'&&interpretations[i].requirementKey==='COLLECTION')interpretations.splice(i,1);
  interpretations.push({requirementKey:key,proposedValue:f.answerValue,sourceStart:0,sourceEnd:f.text.length,sourceSpan:f.text,certainty:'ambiguous'});
  question={templateId:f.question,requirementKey:key,relevantOfferingIds:c.catalog.offerings.filter(o=>o.verified).map(o=>o.id),options:[{id:'authored-answer',value:f.answerValue},{id:'alternative',value:alternative}]};
 }
 return {status:'PROPOSAL',proposal:{schemaVersion:1,preferenceRevisionId:c.members[0].revisionId,interpretations,question}};
}

test('24 authored fixtures cover exactly four cases per required category with independently expected baseline outcomes',()=>{
 assert.equal(evaluationFixtures.length,24);assert.equal(new Set(evaluationFixtures.map(f=>f.id)).size,24);
 for(const category of ['clear','ambiguity','infeasible','merchant_facts','attacks','revisions'])assert.equal(evaluationFixtures.filter(f=>f.category===category).length,4);
 for(const f of evaluationFixtures)checkBaseline(f);
});
test('authored oracle responses exercise all 72 assessments; these stubs are not actual model-quality evidence',()=>{
 for(let repeat=0;repeat<3;repeat++)for(const f of evaluationFixtures){const result=assessClarification(f,authoredResponse(f));assert.deepEqual(result.safetyErrors,[],f.id);assert.equal(result.qualityPassed,true,f.id);}
});
test('safe abstention cannot count as a useful question or a correct clear candidate',()=>{
 for(const f of evaluationFixtures.filter(f=>f.category==='clear'||f.category==='ambiguity')){
  const result=assessClarification(f,{status:'NEEDS_REVIEW'});assert.deepEqual(result.safetyErrors,[]);assert.equal(result.safeAbstention,true);assert.equal(result.qualityPassed,false);assert.equal(result.usefulQuestion,false);assert.equal(result.baselineMatched,null);
 }
});
test('a valid but wrong interpretation cannot relax the authored hard requirement or pass via the same planner',()=>{
 const f=evaluationFixtures.find(f=>f.id==='clear-wheel')!,response=authoredResponse(f);
 if(response.status!=='PROPOSAL')throw new Error('Expected test proposal');
 response.proposal.interpretations.find(i=>i.requirementKey==='TECHNIQUE')!.proposedValue='ANY';
 const result=assessClarification(f,response);assert.equal(result.qualityPassed,false);assert.ok(result.safetyErrors.includes('confirmed_meaning_differs_from_authored_answer'));assert.ok(result.safetyErrors.includes('hard_constraint_violation'));
});
test('production review rejects contradictory values and suppresses questions that cannot affect fit',()=>{
 const f=evaluationFixtures.find(f=>f.id==='clear-wheel')!,c=fixtureContext(f),response=authoredResponse(f);
 if(response.status!=='PROPOSAL')throw new Error('Expected test proposal');
 response.proposal.interpretations.push({...response.proposal.interpretations[0],proposedValue:'HANDBUILD'});
 assert.equal(reviewProposal(response.proposal,c.members[0],c.catalog,6),null);
 const ambiguity=evaluationFixtures.find(f=>f.id==='ambiguous-wheel')!,a=fixtureContext(ambiguity),q=authoredResponse(ambiguity);
 if(q.status!=='PROPOSAL')throw new Error('Expected test question');
 a.members[0].budgetMinor=100;assert.equal(reviewProposal(q.proposal,a.members[0],a.catalog,6),null);
});
