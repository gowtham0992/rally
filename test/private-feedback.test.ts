import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {privateFeedback} from '../app/lib/private-feedback.ts';
import type {Preference} from '../src/planning/domain.ts';
const catalog=JSON.parse(await readFile(new URL('../fixtures/studio.json',import.meta.url),'utf8'));
const preference:Preference={memberId:randomUUID(),revisionId:randomUUID(),budgetMinor:5000,availableSlotIds:['thu-evening'],latestFinishAt:null,technique:'ANY',outcome:'FORM_OWN_CUP',collection:'SELF_LATER',nomineeMemberId:null,extraRequirement:'NONE',unresolvedKeys:[]};
test('private feedback identifies personal leave-by and unresolved essentials without implying studio review was sent',()=>{
 assert.equal(privateFeedback(catalog,preference,6),null);
 assert.match(privateFeedback(catalog,{...preference,latestFinishAt:catalog.slots[0].startAt},6)!,/leave-by/);
 assert.match(privateFeedback(catalog,{...preference,extraRequirement:'MERCHANT_REVIEW_REQUIRED'},6)!,/No studio request/);
 assert.match(privateFeedback(catalog,{...preference,availableSlotIds:[]},6)!,/None of these dates/);
 assert.match(privateFeedback(catalog,{...preference,budgetMinor:100},6)!,/spending limit/);
});
