import {catalogSchema,preferenceSchema,type Preference,type Catalog} from './domain.ts';
import {interpretationSchema} from './interpretation.ts';
export type Proposal=ReturnType<typeof interpretationSchema.parse>;
export type MeaningBound=Partial<Pick<Preference,'technique'|'outcome'|'collection'>> & {cannotAttend?:true;availableSlotIds?:string[]};
export function respectsMeaning(pref:Preference,bound:MeaningBound){
 return (!bound.technique||pref.technique===bound.technique)&&(!bound.outcome||pref.outcome===bound.outcome)
  &&(!bound.collection||pref.collection===bound.collection)&&(!bound.cannotAttend||pref.availableSlotIds.length===0)
  &&(!bound.availableSlotIds||JSON.stringify([...pref.availableSlotIds].sort())===JSON.stringify([...bound.availableSlotIds].sort()));
}
function apply(pref:Preference,key:string,value:string,bound:MeaningBound){
 if(key==='TECHNIQUE'){pref.technique=value as Preference['technique'];bound.technique=pref.technique;}
 if(key==='OUTCOME'){pref.outcome=value as Preference['outcome'];bound.outcome=pref.outcome;}
 if(key==='COLLECTION'){pref.collection=value as Preference['collection'];bound.collection=pref.collection;if(pref.collection!=='NOMINEE_LATER')pref.nomineeMemberId=null;}
 if(key==='TRAVEL'&&value==='CANNOT_ATTEND'){pref.availableSlotIds=[];bound.cannotAttend=true;}
 if(key==='TRAVEL'&&value==='COLLECTION_ONLY'){pref.collection='NOMINEE_LATER';bound.collection='NOMINEE_LATER';}
 if((key==='TRAVEL'&&value==='OTHER')||key==='EXTRA')pref.extraRequirement='MERCHANT_REVIEW_REQUIRED';
}
export function confirmedMeaning(preference:Preference,proposal:Proposal,answerId:string|null){
 const pref=structuredClone(preference),bound:MeaningBound={};pref.extraRequirement='NONE';
 const question=proposal.question,answer=question?.options.find(o=>o.id===answerId);
 if((question&&!answer)||(!question&&answerId!==null))throw new Error('INVALID_ANSWER');
 for(const item of proposal.interpretations){
  if(question&&item.requirementKey===question.requirementKey)continue;
  if(item.certainty!=='explicit')throw new Error('UNRESOLVED_MEANING');
  apply(pref,item.requirementKey,item.proposedValue,bound);
 }
 if(question&&answer)apply(pref,question.requirementKey,answer.value,bound);
 if(pref.collection==='NOMINEE_LATER'&&!pref.nomineeMemberId)pref.unresolvedKeys=[...new Set([...pref.unresolvedKeys.filter(k=>k!=='TRAVEL'),'COLLECTION' as const])];
 else pref.unresolvedKeys=pref.unresolvedKeys.filter(k=>k!=='TRAVEL'&&!(k==='COLLECTION'&&pref.collection!=='UNRESOLVED'));
 return {preference:preferenceSchema.parse(pref),bound};
}
// Potential fit, not a bookable offer: collection consent is still a separate
// human agreement. No budget/availability/capability is relaxed for a question.
function potential(catalog:Catalog,pref:Preference,size:number){
 return catalog.offerings.filter(o=>o.verified&&size>=o.minPeople&&size<=o.maxPeople&&o.priceMinor<=pref.budgetMinor
  &&(pref.technique==='ANY'||o.technique===pref.technique)&&(pref.outcome==='ANY'||o.outcome===pref.outcome)
  &&!(pref.collection==='SAME_DAY_REQUIRED'&&o.requiresLaterCollection)
  &&!(pref.collection==='NOMINEE_LATER'&&(!o.nomineeCollectionAllowed||!o.requiresLaterCollection)))
  .flatMap(o=>catalog.slots.filter(s=>o.slotIds.includes(s.id)&&pref.availableSlotIds.includes(s.id)
   &&(!pref.latestFinishAt||Date.parse(s.startAt)+o.durationMinutes*60000<=Date.parse(pref.latestFinishAt)))
   .map(s=>({id:o.id,signature:o.id+':'+s.id}))).sort((a,b)=>a.signature.localeCompare(b.signature));
}
export function consequentialQuestion(proposal:Proposal,preference:Preference,catalogValue:unknown,size:number){
 const q=proposal.question;if(!q)return null;
 const catalog=catalogSchema.parse(catalogValue);
 if(proposal.interpretations.some(i=>i.requirementKey==='EXTRA'))return null;
 const possibilities=q.options.map(option=>{const pref=structuredClone(preference);pref.extraRequirement='NONE';apply(pref,q.requirementKey,option.value,{});return option.value==='OTHER'?[]:potential(catalog,pref,size);});
 const distinct=new Set(possibilities.map(p=>JSON.stringify(p.map(x=>x.signature))));
 if(distinct.size<2||!possibilities.some(p=>p.length))return null;
 const relevant=new Set(possibilities.flat().map(p=>p.id));
 const relevantOfferingIds=q.relevantOfferingIds.filter(id=>relevant.has(id));
 return relevantOfferingIds.length?{...q,relevantOfferingIds}:null;
}

// Shared by persistent intake and evaluation: a schema-valid model response is
// not necessarily suitable for participant confirmation.
export function reviewProposal(value:Proposal,preference:Preference,catalog:unknown,size:number):Proposal|null{
 const proposal=structuredClone(value);
 if(proposal.question)proposal.question=consequentialQuestion(proposal,preference,catalog,size);
 const contradictory=proposal.interpretations.some(i=>i.certainty==='explicit'&&i.requirementKey!==proposal.question?.requirementKey
  &&proposal.interpretations.some(j=>j.certainty==='explicit'&&j.requirementKey===i.requirementKey&&j.proposedValue!==i.proposedValue));
 if(contradictory||proposal.interpretations.length===0||proposal.interpretations.some(i=>i.requirementKey==='EXTRA'
  ||(i.certainty==='ambiguous'&&i.requirementKey!==proposal.question?.requirementKey)))return null;
 return proposal;
}
