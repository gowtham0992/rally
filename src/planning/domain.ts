import { z } from 'zod';

export const technique = z.enum(['ANY','WHEEL','HANDBUILD','DECORATE']);
export const outcome = z.enum(['ANY','FORM_OWN_CUP','DECORATE_EXISTING']);
export const collection = z.enum(['UNRESOLVED','SAME_DAY_REQUIRED','SELF_LATER','NOMINEE_LATER']);
const uuid=z.uuid(),key=z.string().min(1).max(100);
export const preferenceSchema=z.strictObject({
  memberId:uuid,revisionId:uuid,budgetMinor:z.number().int().min(1).max(1000000),
  availableSlotIds:z.array(key).max(20),latestFinishAt:z.iso.datetime().nullable(),
  technique,outcome,collection,nomineeMemberId:uuid.nullable(),
  extraRequirement:z.enum(['NONE','MERCHANT_REVIEW_REQUIRED']),
  unresolvedKeys:z.array(z.enum(['TECHNIQUE','OUTCOME','COLLECTION','TRAVEL'])).max(4)
});
export const consentSchema=z.strictObject({
  ownerMemberId:uuid,nomineeMemberId:uuid,preferenceRevisionId:uuid,
  ownerAgreed:z.boolean(),nomineeAgreed:z.boolean(),disclosureAgreed:z.boolean(),revoked:z.boolean()
});
export const catalogSchema=z.strictObject({
  versionId:key,studioId:key,studioName:z.string().min(1).max(100),timezone:key,synthetic:z.boolean(),
  slots:z.array(z.strictObject({id:key,startAt:z.iso.datetime()})).max(20),
  offerings:z.array(z.strictObject({id:key,name:z.string().min(1).max(100),verified:z.boolean(),
    technique:technique.exclude(['ANY']),outcome:outcome.exclude(['ANY']),
    priceMinor:z.number().int().min(1).max(1000000),durationMinutes:z.number().int().min(1).max(480),
    minPeople:z.number().int().min(1).max(8),maxPeople:z.number().int().min(1).max(8),
    slotIds:z.array(key).max(20),requiresLaterCollection:z.boolean(),nomineeCollectionAllowed:z.boolean(),
    collectionDescription:z.string().min(1).max(300),cancellationTerms:z.string().min(1).max(1000)
  }).refine(o=>o.minPeople<=o.maxPeople)).max(20)
});
export type Preference=z.infer<typeof preferenceSchema>;
export type Catalog=z.infer<typeof catalogSchema>;
export type Consent=z.infer<typeof consentSchema>;
export interface Candidate {
  catalogVersionId:string;studioId:string;studioName:string;offeringId:string;activity:string;
  slotId:string;startAt:string;endAt:string;timezone:string;amountMinor:number;currency:'USD';
  groupSize:number;collectionDescription:string;cancellationTerms:string;synthetic:boolean;
}
export type PlanningResult={state:'CANDIDATE_READY';candidates:Candidate[]}
  | {state:'NEEDS_CLARIFICATION'|'MERCHANT_REVIEW_REQUIRED'|'INFEASIBLE';message:string};

// The planner is the same for AI-assisted and structured-baseline modes. AI may
// suggest a question, but cannot change these confirmed inputs or filtering rules.
export function planGroup(catalogValue:unknown,preferenceValues:unknown[],consentValues:unknown[]=[]):PlanningResult {
  const catalog=catalogSchema.parse(catalogValue),preferences=preferenceValues.map(p=>preferenceSchema.parse(p)),consents=consentValues.map(c=>consentSchema.parse(c));
  if(preferences.length<1||preferences.length>8||new Set(preferences.map(p=>p.memberId)).size!==preferences.length) throw new Error('Invalid fixed roster');
  // Validate the configured timezone even though all calculations use UTC instants.
  new Intl.DateTimeFormat('en-US',{timeZone:catalog.timezone}).format(0);
  const slots=new Map(catalog.slots.map(s=>[s.id,s]));
  if(slots.size!==catalog.slots.length||new Set(catalog.offerings.map(o=>o.id)).size!==catalog.offerings.length) throw new Error('Duplicate catalog identity');
  if(preferences.some(p=>p.availableSlotIds.some(id=>!slots.has(id)))||catalog.offerings.some(o=>o.slotIds.some(id=>!slots.has(id)))) throw new Error('Unknown catalog slot');
  const unavailable={state:'INFEASIBLE' as const,message:'No studio option meets this group’s requirements.'};
  if(preferences.some(p=>p.availableSlotIds.length===0)) return unavailable;
  const review={state:'MERCHANT_REVIEW_REQUIRED' as const,message:'The studio must verify the remaining requirements or offering facts.'};
  if(preferences.some(p=>p.extraRequirement==='MERCHANT_REVIEW_REQUIRED')) return review;
  if(preferences.some(p=>p.unresolvedKeys.length>0||p.collection==='UNRESOLVED')) return {state:'NEEDS_CLARIFICATION',message:'A specific answer is needed before this group can receive an offer.'};
  const roster=new Set(preferences.map(p=>p.memberId));
  for(const pref of preferences.filter(p=>p.collection==='NOMINEE_LATER')) {
    const consent=consents.find(c=>c.ownerMemberId===pref.memberId&&c.nomineeMemberId===pref.nomineeMemberId&&c.preferenceRevisionId===pref.revisionId);
    if(!pref.nomineeMemberId||pref.nomineeMemberId===pref.memberId||!roster.has(pref.nomineeMemberId)||!consent||!consent.ownerAgreed||!consent.nomineeAgreed||!consent.disclosureAgreed||consent.revoked)
      return {state:'NEEDS_CLARIFICATION',message:'The collection arrangement needs agreement before an offer can be issued.'};
  }
  const candidates:Candidate[]=[];
  for(const offering of catalog.offerings) for(const slotId of offering.slotIds) {
    if(!offering.verified) continue;
    const slot=slots.get(slotId)!;
    const endAt=new Date(Date.parse(slot.startAt)+offering.durationMinutes*60000).toISOString();
    const eligible=preferences.every(p=>p.availableSlotIds.includes(slotId)
      &&p.budgetMinor>=offering.priceMinor
      &&(!p.latestFinishAt||Date.parse(endAt)<=Date.parse(p.latestFinishAt))
      &&(p.technique==='ANY'||p.technique===offering.technique)
      &&(p.outcome==='ANY'||p.outcome===offering.outcome)
      &&(!offering.requiresLaterCollection||p.collection!=='SAME_DAY_REQUIRED')
      &&(p.collection!=='NOMINEE_LATER'||offering.nomineeCollectionAllowed));
    if(!eligible||preferences.length<offering.minPeople||preferences.length>offering.maxPeople) continue;
    // Only published facts cross into this shared projection. Private inputs and
    // participant identities never enter a shared explanatory model prompt.
    candidates.push({catalogVersionId:catalog.versionId,studioId:catalog.studioId,studioName:catalog.studioName,
      offeringId:offering.id,activity:offering.name,slotId,startAt:slot.startAt,endAt,timezone:catalog.timezone,
      amountMinor:offering.priceMinor,currency:'USD',groupSize:preferences.length,
      collectionDescription:offering.collectionDescription,cancellationTerms:offering.cancellationTerms,synthetic:catalog.synthetic});
  }
  candidates.sort((a,b)=>a.amountMinor-b.amountMinor||Date.parse(a.startAt)-Date.parse(b.startAt)||a.offeringId.localeCompare(b.offeringId)||a.slotId.localeCompare(b.slotId));
  return candidates.length ? {state:'CANDIDATE_READY',candidates} : catalog.offerings.some(o=>!o.verified) ? review : unavailable;
}
