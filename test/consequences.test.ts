import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {catalogSchema,planGroup,type Preference} from '../src/planning/domain.ts';
import {answerConsequences} from '../src/planning/consequences.ts';
import {confirmedMeaning,type Proposal} from '../src/planning/meaning.ts';
import AnswerConsequencePreview from '../app/components/answer-consequence.tsx';
import FitSummary from '../app/components/fit-summary.tsx';
const catalog=catalogSchema.parse(JSON.parse(readFileSync(new URL('../fixtures/studio.json',import.meta.url),'utf8')));
const pref:Preference={memberId:'11111111-1111-4111-8111-111111111111',revisionId:'22222222-2222-4222-8222-222222222222',budgetMinor:5000,availableSlotIds:['thu-evening'],latestFinishAt:null,technique:'ANY',outcome:'FORM_OWN_CUP',collection:'SELF_LATER',nomineeMemberId:null,extraRequirement:'MERCHANT_REVIEW_REQUIRED',unresolvedKeys:[]};
const proposal:Proposal={schemaVersion:1,preferenceRevisionId:pref.revisionId,interpretations:[{requirementKey:'TRAVEL',proposedValue:'COLLECTION_ONLY',sourceStart:0,sourceEnd:15,sourceSpan:'I leave Friday.',certainty:'ambiguous'}],question:{templateId:'TRAVEL_MEANING',requirementKey:'TRAVEL',relevantOfferingIds:['handbuild'],options:[{id:'attendance',value:'CANNOT_ATTEND'},{id:'collection',value:'COLLECTION_ONLY'},{id:'other',value:'OTHER'}]}};

test('travel answer previews show no attendance versus the actual $48 session without saving or inventing consent',()=>{
 const original=structuredClone({pref,proposal,catalog}),result=answerConsequences(catalog,pref,proposal,6);
 assert.deepEqual(result.map(c=>c.state),['NO_MATCH','POSSIBLE','NEEDS_REVIEW']);
 assert.equal(result[0].sessions.length,0);assert.equal(result[1].sessions.length,1);
 assert.equal(result[1].sessions[0].amountMinor,4800);assert.equal(result[1].sessions[0].slotId,'thu-evening');assert.equal(result[1].needsCollectionAgreement,true);
 const projected=confirmedMeaning(pref,proposal,'collection').preference;
 assert.equal(planGroup(catalog,Array.from({length:6},(_,i)=>({...projected,memberId:`00000000-0000-4000-8000-00000000000${i}`}))).state,'NEEDS_CLARIFICATION');
 assert.deepEqual({pref,proposal,catalog},original);
 const html=renderToStaticMarkup(createElement(AnswerConsequencePreview,{consequence:result[1]}));
 for(const text of ['$48','Hand-build a cup','Nov 19','If a friend agrees','group’s other requirements'])assert.ok(html.includes(text),text);
 assert.ok(!JSON.stringify(result).includes(pref.memberId));assert.ok(!JSON.stringify(result).includes('budgetMinor'));
});
test('answer preview applies every explicit interpretation through the same transition as confirmation',()=>{
 const p=structuredClone(proposal);p.interpretations.push({requirementKey:'TECHNIQUE',proposedValue:'WHEEL',sourceStart:0,sourceEnd:15,sourceSpan:'I leave Friday.',certainty:'explicit'});
 assert.equal(answerConsequences(catalog,pref,p,6)[1].state,'NO_MATCH');
 const broad={...pref,budgetMinor:10000};assert.deepEqual(answerConsequences(catalog,broad,p,6)[1].sessions.map(s=>s.offeringId),['wheel']);
});
test('answer preview respects budget, finish, capacity, catalog verification and unhandled must-haves',()=>{
 for(const changed of [{...pref,budgetMinor:4799},{...pref,latestFinishAt:catalog.slots[0].startAt}])assert.equal(answerConsequences(catalog,changed,proposal,6)[1].state,'NO_MATCH');
 assert.equal(answerConsequences(catalog,pref,proposal,5)[1].state,'NO_MATCH');
 const unpublished=structuredClone(catalog);unpublished.offerings.forEach(o=>o.verified=false);assert.equal(answerConsequences(unpublished,pref,proposal,6)[1].state,'NO_MATCH');
 const unresolved={...pref,unresolvedKeys:['TECHNIQUE' as const]};assert.equal(answerConsequences(catalog,unresolved,proposal,6)[1].needsMeaning,true);
 assert.throws(()=>answerConsequences(catalog,pref,{...proposal,question:{...proposal.question!,options:[{id:'bad',value:'COLLECTION_ONLY'}]},interpretations:[{...proposal.interpretations[0],requirementKey:'TECHNIQUE'}]},6));
});
test('explicit-only clarification also previews the exact confirmed change',()=>{
 const p:Proposal={...proposal,question:null,interpretations:[{...proposal.interpretations[0],requirementKey:'TECHNIQUE',proposedValue:'WHEEL',certainty:'explicit'}]};
 const result=answerConsequences(catalog,pref,p,6);assert.equal(result.length,1);assert.equal(result[0].answerId,null);assert.equal(result[0].state,'NO_MATCH');
});
test('fit summary distinguishes unsaved, private unresolved and actually shared fit',()=>{
 const html=(p:Preference|null,draft=false,candidate:ReturnType<typeof planGroup>|null=null)=>renderToStaticMarkup(createElement(FitSummary,{catalog,preference:p,groupSize:6,draft,candidate}));
 assert.ok(html(null).includes('Let’s find your fit'));assert.ok(html(pref).includes('Your note needs a check'));
 assert.ok(html({...pref,extraRequirement:'NONE'}).includes('1 of 6 published sessions fit your choices'));
 assert.ok(html({...pref,extraRequirement:'NONE'},true).includes('Unsaved preview'));
 const candidate=planGroup(catalog,Array.from({length:6},(_,i)=>({...pref,extraRequirement:'NONE',memberId:`00000000-0000-4000-8000-00000000000${i}`})));
 assert.ok(html(pref,false,candidate).includes('everyone’s confirmed choices'));
 assert.ok(!html(pref,true,candidate).includes('everyone’s confirmed choices'));
 assert.ok(html({...pref,extraRequirement:'NONE',collection:'NOMINEE_LATER'}).includes('pickup plan needs agreement'));
});
