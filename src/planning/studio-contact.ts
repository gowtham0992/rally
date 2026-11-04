import {preferenceSchema,type Catalog,type Preference} from './domain.ts';
import type {MeaningBound} from './meaning.ts';
export function studioContactAgreed(pref:Preference,bound:MeaningBound|null|undefined,catalog:Catalog){
 const confirmation=bound?.studioContact;
 return Boolean(confirmation&&confirmation.confirmedByMemberId===pref.memberId&&confirmation.noticeAgreed===true
  &&catalog.contact?.email&&confirmation.contactEmail===catalog.contact.email);
}
// Legacy confirmations did not authorize even a generic merchant notice. Keep
// those records intact, but require fresh review during subsequent planning.
export function planningPreference(value:unknown,bound:MeaningBound|null|undefined,catalog:Catalog):Preference{
 const pref=preferenceSchema.parse(value);
 return bound?.studioContact&&!studioContactAgreed(pref,bound,catalog)||bound?.studioQuestion&&!studioQuestionAgreed(pref,bound,catalog)?{...pref,extraRequirement:'MERCHANT_REVIEW_REQUIRED'}:pref;
}
export function studioQuestionAgreed(pref:Preference,bound:MeaningBound|null|undefined,catalog:Catalog){
 const q=bound?.studioQuestion;
 return Boolean(q&&q.confirmedByMemberId===pref.memberId&&q.acceptedPreferenceId===pref.revisionId&&q.studioId===catalog.studioId&&q.catalogVersionId===catalog.versionId&&Date.parse(q.expiresAt)>Date.now()
  &&catalog.offerings.some(o=>o.id===q.offeringId&&o.verified&&o.slotIds.includes(q.slotId)));
}
