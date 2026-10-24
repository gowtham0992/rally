import {matchingSessions,type Catalog,type Candidate,type Preference} from './domain.ts';
import {confirmedMeaning,type Proposal} from './meaning.ts';

export type AnswerConsequence={answerId:string|null;state:'NO_MATCH'|'POSSIBLE'|'NEEDS_REVIEW';sessions:Candidate[];needsCollectionAgreement:boolean;needsMeaning:boolean};

// Owner-only counterfactuals. Uses exactly the meaning transition used on save,
// then the same catalog filter as group planning. No peer inputs, hypothetical
// consent, reservation or model-generated price can enter this projection.
export function answerConsequences(catalog:Catalog,preference:Preference,proposal:Proposal,groupSize:number):AnswerConsequence[]{
 const answers=proposal.question?proposal.question.options.map(o=>o.id):[null];
 return answers.map(answerId=>{
  const resolved=confirmedMeaning(preference,proposal,answerId).preference;
  const needsCollectionAgreement=resolved.collection==='NOMINEE_LATER';
  const needsMeaning=resolved.unresolvedKeys.some(k=>k!=='COLLECTION')||resolved.collection==='UNRESOLVED';
  if(resolved.extraRequirement!=='NONE')return {answerId,state:'NEEDS_REVIEW',sessions:[],needsCollectionAgreement,needsMeaning};
  const sessions=matchingSessions(catalog,[resolved],groupSize);
  return {answerId,state:sessions.length?'POSSIBLE':'NO_MATCH',sessions,needsCollectionAgreement,needsMeaning};
 });
}
