import {confirmedMeaning,type Proposal,type MeaningBound} from './meaning.ts';
import type {Preference} from './domain.ts';
export type DraftFields=Pick<MeaningBound,'technique'|'outcome'|'collection'|'cannotAttend'>;
export function reviewDraftProposal(proposal:Proposal):Proposal|null{
 if(!proposal.interpretations.length||proposal.interpretations.some(i=>i.requirementKey==='EXTRA'||i.proposedValue==='OTHER'))return null;
 if(proposal.interpretations.some(i=>i.certainty==='ambiguous'&&i.requirementKey!==proposal.question?.requirementKey))return null;
 if(proposal.interpretations.some(i=>i.certainty==='explicit'&&i.requirementKey!==proposal.question?.requirementKey&&proposal.interpretations.some(j=>j.certainty==='explicit'&&j.requirementKey===i.requirementKey&&j.proposedValue!==i.proposedValue)))return null;
 // Cross-key contradictions also fail closed (e.g. self pickup plus travel requiring a nominee).
 if(!proposal.question)try{draftFields(proposal,null);}catch{return null;}
 return proposal;
}
export function draftFields(proposal:Proposal,answerId:string|null):DraftFields{
 // Scratch values satisfy the existing meaning projector. They are never sent,
 // displayed, saved or used to choose a person's spending limit or dates.
 const scratch:Preference={memberId:proposal.preferenceRevisionId,revisionId:proposal.preferenceRevisionId,budgetMinor:1,availableSlotIds:[],latestFinishAt:null,technique:'ANY',outcome:'ANY',collection:'UNRESOLVED',nomineeMemberId:null,extraRequirement:'NONE',unresolvedKeys:[]};
 const {bound}=confirmedMeaning(scratch,proposal,answerId);
 const assignments=proposal.interpretations.filter(i=>i.certainty==='explicit'&&i.requirementKey!==proposal.question?.requirementKey).map(i=>({key:i.requirementKey==='TRAVEL'&&i.proposedValue==='COLLECTION_ONLY'?'COLLECTION':i.requirementKey,value:i.proposedValue==='COLLECTION_ONLY'?'NOMINEE_LATER':i.proposedValue}));
 if(proposal.question){const a=proposal.question.options.find(a=>a.id===answerId);if(a)assignments.push({key:proposal.question.requirementKey==='TRAVEL'&&a.value==='COLLECTION_ONLY'?'COLLECTION':proposal.question.requirementKey,value:a.value==='COLLECTION_ONLY'?'NOMINEE_LATER':a.value});}
 if(assignments.some(i=>assignments.some(j=>i.key===j.key&&i.value!==j.value)))throw Error('CONTRADICTORY_DRAFT');
 if(proposal.question?.options.find(o=>o.id===answerId)?.value==='OTHER')throw Error('UNSUPPORTED_DRAFT');
 return bound;
}
export function matchesDraft(p:Pick<Preference,'technique'|'outcome'|'collection'|'availableSlotIds'>,fields:DraftFields){
 return (!fields.technique||p.technique===fields.technique)&&(!fields.outcome||p.outcome===fields.outcome)&&(!fields.collection||p.collection===fields.collection)&&(!fields.cannotAttend||p.availableSlotIds.length===0);
}
