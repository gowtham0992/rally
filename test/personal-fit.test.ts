import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {catalogSchema,planGroup,type Preference} from '../src/planning/domain.ts';
import {personalFit} from '../app/lib/personal-fit.ts';
import {activityChoice,activityRequirements} from '../app/lib/activity-choice.ts';
import {groupSessionOptions} from '../app/lib/session-options.ts';
import SessionOptions from '../app/components/session-options.tsx';
import PersonalFit from '../app/components/personal-fit.tsx';
import StudioOptions from '../app/components/studio-options.tsx';
const catalog=catalogSchema.parse(JSON.parse(readFileSync(new URL('../fixtures/studio.json',import.meta.url),'utf8')));
const preference:Preference={memberId:'11111111-1111-4111-8111-111111111111',revisionId:'22222222-2222-4222-8222-222222222222',budgetMinor:9000,availableSlotIds:['thu-evening','fri-evening'],latestFinishAt:null,technique:'ANY',outcome:'ANY',collection:'SELF_LATER',nomineeMemberId:null,extraRequirement:'NONE',unresolvedKeys:[]};
const members=Array.from({length:6},(_,i)=>({...preference,memberId:`00000000-0000-4000-8000-00000000000${i}`}));

test('all six eligible activity and date combinations remain visible and requestable',()=>{
 const result=planGroup(catalog,members);assert.equal(result.state,'CANDIDATE_READY');if(result.state!=='CANDIDATE_READY')throw Error('Missing options');
 const presented=groupSessionOptions(result.candidates);
 assert.deepEqual(presented.flatMap(group=>group.sessions.map(s=>s.offeringId+':'+s.slotId)),['decorate:thu-evening','decorate:fri-evening','handbuild:thu-evening','handbuild:fri-evening','wheel:thu-evening','wheel:fri-evening']);
 const html=renderToStaticMarkup(createElement(SessionOptions,{candidates:result.candidates,onRequest:()=>{}}));
 assert.equal((html.match(/<button /g)??[]).length,6);assert.ok(html.includes('Wheel workshop'));
});

test('personal fit respects exact spending, outcome, finish, collection, capacity and verified public facts',()=>{
 const cup={...preference,budgetMinor:5000,outcome:'FORM_OWN_CUP' as const};
 assert.deepEqual(personalFit(catalog,cup,6).sessions.map(s=>s.offeringId),['handbuild','handbuild']);
 assert.equal(personalFit(catalog,{...cup,budgetMinor:4799},6).sessions.length,0);
 assert.equal(personalFit(catalog,{...cup,technique:'WHEEL'},6).sessions.length,0);
 assert.equal(personalFit(catalog,{...cup,latestFinishAt:catalog.slots[0].startAt},6).sessions.length,0);
 assert.equal(personalFit(catalog,{...cup,collection:'SAME_DAY_REQUIRED'},6).sessions.length,0);
 assert.equal(personalFit(catalog,cup,5).sessions.length,0);
 const unverified=structuredClone(catalog);unverified.offerings.find(o=>o.id==='handbuild')!.verified=false;
 assert.equal(personalFit(unverified,cup,6).sessions.length,0);
 const before=structuredClone(cup);personalFit(catalog,cup,6);assert.deepEqual(cup,before);
});

test('personal possibilities never establish collection consent or verification of an essential note',()=>{
 const pending={...preference,collection:'NOMINEE_LATER' as const,extraRequirement:'MERCHANT_REVIEW_REQUIRED' as const,unresolvedKeys:['COLLECTION' as const]};
 const result=personalFit(catalog,pending,6);assert.equal(result.sessions.length,6);assert.equal(result.pendingCollection,true);assert.equal(result.pendingNote,true);
 assert.equal(planGroup(catalog,[pending,...members.slice(1)]).state,'MERCHANT_REVIEW_REQUIRED');
 const html=renderToStaticMarkup(createElement(PersonalFit,{catalog,preference:pending,groupSize:6}));
 assert.ok(html.includes('We can’t check every must-have yet.'));assert.ok(html.includes('Your note still needs an answer'));assert.ok(html.includes('need an agreed collector'));assert.ok(html.includes('does not reserve a session or approve a payment'));
 const nominee={...preference,collection:'NOMINEE_LATER' as const,nomineeMemberId:members[1].memberId};
 assert.equal(personalFit(catalog,nominee,6).pendingCollection,true);assert.equal(planGroup(catalog,[nominee,...members.slice(1)]).state,'NEEDS_CLARIFICATION');
 assert.equal(personalFit(catalog,nominee,6,true).pendingCollection,false);
 assert.equal(personalFit(catalog,{...preference,unresolvedKeys:['OUTCOME']},6).pendingMeaning,true);
});

test('a collective date mismatch preserves useful owner-only results without identifying another friend',()=>{
 const thursday={...preference,availableSlotIds:['thu-evening']},friday={...members[1],availableSlotIds:['fri-evening']};
 assert.equal(planGroup(catalog,[thursday,friday,...members.slice(2)]).state,'INFEASIBLE');
 const fit=personalFit(catalog,thursday,6);assert.equal(fit.sessions.length,3);assert.equal(fit.message,null);
 const text=JSON.stringify(fit);assert.ok(!text.includes('budgetMinor'));assert.ok(!text.includes(thursday.memberId));assert.ok(!text.includes(friday.memberId));assert.ok(fit.sessions.every(s=>s.slotId==='thu-evening'));
});

test('combined activity choices preserve every existing field combination until an explicit replacement',()=>{
 for(const technique of ['ANY','WHEEL','HANDBUILD','DECORATE'] as const)for(const outcome of ['ANY','FORM_OWN_CUP','DECORATE_EXISTING'] as const){
  const selection=activityChoice(technique,outcome),replacement=activityRequirements(selection);
  if(selection==='SAVED')assert.equal(replacement,null);else assert.deepEqual(replacement,{technique,outcome});
 }
 assert.equal(activityChoice('WHEEL','ANY'),'SAVED');assert.deepEqual(activityRequirements('CUP'),{technique:'ANY',outcome:'FORM_OWN_CUP'});
});

test('public outing preview explains the actual prices, dates and collection without invitation information',()=>{
 const html=renderToStaticMarkup(createElement(StudioOptions,{catalog}));
 for(const fact of ['$42','$48','$72','75 minutes','90 minutes','120 minutes','Nov 19','Nov 20','collected later'])assert.ok(html.includes(fact),fact);
 assert.ok(!html.includes(preference.memberId));assert.ok(!html.includes('budgetMinor'));
 const unpublished=renderToStaticMarkup(createElement(StudioOptions,{catalog:{...catalog,offerings:catalog.offerings.map(o=>({...o,verified:false}))}}));assert.ok(!unpublished.includes('$48'));assert.ok(unpublished.includes('hasn’t published verified activities'));
 const empty=renderToStaticMarkup(createElement(StudioOptions,{catalog:{...catalog,slots:[],offerings:[]}}));assert.ok(empty.includes('hasn’t published verified activities'));assert.ok(empty.includes('hasn’t published dates'));
});
