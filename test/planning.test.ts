import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { planGroup,catalogSchema,type Preference } from '../src/planning/domain.ts';
import { interpretationInput,validateInterpretation } from '../src/planning/interpretation.ts';
const catalog=catalogSchema.parse(JSON.parse(readFileSync(new URL('../fixtures/studio.json',import.meta.url),'utf8')));
function group():Preference[] {return Array.from({length:6},()=>({memberId:randomUUID(),revisionId:randomUUID(),budgetMinor:9000,availableSlotIds:['thu-evening','fri-evening'],latestFinishAt:null,technique:'ANY',outcome:'FORM_OWN_CUP',collection:'SELF_LATER',nomineeMemberId:null,extraRequirement:'NONE',unresolvedKeys:[]}));}
test('confirmed cup-making requirement and private ceiling select only the fixed $48 offering',()=>{
  const members=group();members[0].budgetMinor=5000;
  const result=planGroup(catalog,members);assert.equal(result.state,'CANDIDATE_READY');
  if(result.state!=='CANDIDATE_READY')throw new Error('No candidate');
  assert.deepEqual(result.candidates.map(c=>c.offeringId),['handbuild','handbuild']);
  assert.equal(result.candidates[0].amountMinor,4800);
  const shared=JSON.stringify(result);
  assert.ok(!shared.includes('budgetMinor'));assert.ok(members.every(m=>!shared.includes(m.memberId)));
});
test('wheel-essential with a $50 maximum is infeasible without relaxing requirements',()=>{
  const members=group();members[0].budgetMinor=5000;members[0].technique='WHEEL';
  const before=structuredClone(members);assert.equal(planGroup(catalog,members).state,'INFEASIBLE');assert.deepEqual(members,before);
});
test('empty availability and incompatible finish time cannot produce a booking candidate',()=>{
  const members=group();members[0].availableSlotIds=[];assert.equal(planGroup(catalog,members).state,'INFEASIBLE');
  members[0].availableSlotIds=['thu-evening'];members[0].latestFinishAt='2026-11-20T02:00:00Z';
  assert.equal(planGroup(catalog,members).state,'INFEASIBLE');
});
test('a collection nominee requires both parties, current revision and disclosure consent',()=>{
  const members=group();members[0].collection='NOMINEE_LATER';members[0].nomineeMemberId=members[1].memberId;
  const consent={ownerMemberId:members[0].memberId,nomineeMemberId:members[1].memberId,preferenceRevisionId:members[0].revisionId,ownerAgreed:true,nomineeAgreed:true,disclosureAgreed:true,revoked:false};
  assert.equal(planGroup(catalog,members).state,'NEEDS_CLARIFICATION');
  assert.equal(planGroup(catalog,members,[{...consent,nomineeAgreed:false}]).state,'NEEDS_CLARIFICATION');
  assert.equal(planGroup(catalog,members,[{...consent,preferenceRevisionId:randomUUID()}]).state,'NEEDS_CLARIFICATION');
  assert.equal(planGroup(catalog,members,[{...consent,disclosureAgreed:false}]).state,'NEEDS_CLARIFICATION');
  assert.equal(planGroup(catalog,members,[consent]).state,'CANDIDATE_READY');
  assert.equal(planGroup(catalog,members,[{...consent,revoked:true}]).state,'NEEDS_CLARIFICATION');
});
test('same-day collection, unresolved meaning and unsupported needs cannot be silently satisfied',()=>{
  const members=group();members[0].collection='SAME_DAY_REQUIRED';assert.equal(planGroup(catalog,members).state,'INFEASIBLE');
  members[0].collection='UNRESOLVED';assert.equal(planGroup(catalog,members).state,'NEEDS_CLARIFICATION');
  members[0].collection='SELF_LATER';members[0].unresolvedKeys=['TECHNIQUE'];assert.equal(planGroup(catalog,members).state,'NEEDS_CLARIFICATION');
  members[0].extraRequirement='MERCHANT_REVIEW_REQUIRED';assert.equal(planGroup(catalog,members).state,'MERCHANT_REVIEW_REQUIRED');
});
test('unverified facts cannot support an offer, and malformed catalog references are rejected',()=>{
  const members=group();members[0].budgetMinor=5000;
  const unverified=structuredClone(catalog);unverified.offerings.find(o=>o.id==='handbuild')!.verified=false;
  assert.equal(planGroup(unverified,members).state,'MERCHANT_REVIEW_REQUIRED');
  assert.throws(()=>planGroup(catalog,[{...members[0],availableSlotIds:['invented-slot']}])) ;
});
test('AI-assisted and structured modes give identical results with the same confirmed facts',()=>{
  const members=group();members[0].budgetMinor=5000;
  const assisted=planGroup(catalog,members),baseline=planGroup(catalog,structuredClone(members));assert.deepEqual(assisted,baseline);
  members[0].budgetMinor=9000;
  const moreBudget=planGroup(catalog,members);assert.equal(moreBudget.state,'CANDIDATE_READY');
  if(moreBudget.state==='CANDIDATE_READY')assert.equal(moreBudget.candidates[0].amountMinor,4800);
});
test('model input excludes structured budgets, identities and other participants',()=>{
  const revisionId=randomUUID(),result=interpretationInput({revisionId,text:'I leave Friday, so I probably cannot do pottery.',catalog});
  assert.deepEqual(Object.keys(result.data),['preferenceRevisionId','optionalParticipantWording','offerings']);
  assert.throws(()=>interpretationInput({revisionId,text:'hello',catalog,budgetMinor:5000}));
});
test('interpretations need exact evidence and cannot invent capability or payment authority',()=>{
  const revisionId=randomUUID(),text='I leave Friday';
  const valid={schemaVersion:1,preferenceRevisionId:revisionId,interpretations:[{requirementKey:'TRAVEL',proposedValue:'COLLECTION_ONLY',sourceStart:0,sourceEnd:text.length,sourceSpan:text,certainty:'ambiguous'}],question:{templateId:'TRAVEL_MEANING',requirementKey:'TRAVEL',relevantOfferingIds:['handbuild'],options:[{id:'attendance',value:'CANNOT_ATTEND'},{id:'collection',value:'COLLECTION_ONLY'}]}};
  assert.deepEqual(validateInterpretation(valid,{revisionId,text,catalog}),valid);
  assert.throws(()=>validateInterpretation({...valid,preferenceRevisionId:randomUUID()},{revisionId,text,catalog}));
  assert.throws(()=>validateInterpretation({...valid,interpretations:[{...valid.interpretations[0],sourceSpan:'invented text'}]},{revisionId,text,catalog}));
  assert.throws(()=>validateInterpretation({...valid,question:{...valid.question,relevantOfferingIds:['invented']}},{revisionId,text,catalog}));
  assert.throws(()=>validateInterpretation({...valid,capturePayment:true},{revisionId,text,catalog}));
});
