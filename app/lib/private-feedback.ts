import type {Catalog,Preference} from '../../src/planning/domain.ts';
// This explanation is rendered only inside the participant's private view.
// It evaluates their choices against public facts, never another friend's needs.
export function privateFeedback(catalog:Catalog,p:Preference,groupSize:number):string|null{
 if(p.extraRequirement==='MERCHANT_REVIEW_REQUIRED')return 'Your note contains an essential need that isn’t covered yet. Review your note or edit your details. No studio request has been sent.';
 if(!p.availableSlotIds.length)return 'None of these dates work for you. Edit your dates if another published time works; otherwise this studio’s options can’t meet your needs.';
 if(p.collection==='UNRESOLVED'||p.unresolvedKeys.some(key=>key!=='COLLECTION')||p.unresolvedKeys.length&&p.collection!=='NOMINEE_LATER')return 'One of your must-haves still needs an answer. Edit your details before the group requests a session.';
 let options=catalog.offerings.filter(o=>o.verified&&groupSize>=o.minPeople&&groupSize<=o.maxPeople).flatMap(o=>o.slotIds.map(id=>({o,slot:catalog.slots.find(s=>s.id===id)!})));
 if(!options.length)return 'The studio hasn’t published a verified session for this group size. No studio request has been sent.';
 options=options.filter(({slot})=>p.availableSlotIds.includes(slot.id));if(!options.length)return 'The studio has no session on your selected dates. Your dates remain saved.';
 options=options.filter(({o})=>p.technique==='ANY'||p.technique===o.technique);if(!options.length)return 'The studio’s sessions on your dates don’t include your required technique. Your must-have stays saved.';
 options=options.filter(({o})=>p.outcome==='ANY'||p.outcome===o.outcome);if(!options.length)return 'The available sessions don’t include what you need to make. Your must-have stays saved.';
 options=options.filter(({o})=>o.priceMinor<=p.budgetMinor);if(!options.length)return 'No matching session is within your spending limit. Your limit stays private and won’t be changed for you.';
 options=options.filter(({o,slot})=>!p.latestFinishAt||Date.parse(slot.startAt)+o.durationMinutes*60000<=Date.parse(p.latestFinishAt));if(!options.length)return 'No matching session ends before your leave-by time. Your time limit stays private and saved.';
 options=options.filter(({o})=>(!o.requiresLaterCollection||p.collection!=='SAME_DAY_REQUIRED')&&(p.collection!=='NOMINEE_LATER'||o.nomineeCollectionAllowed));if(!options.length)return 'The available sessions can’t meet your collection requirement. Your must-have stays saved.';
 if(p.collection==='NOMINEE_LATER'&&!p.nomineeMemberId)return 'Your pickup need is saved. Ask a friend here; both of you need to agree before a session can be requested.';
 return null;
}
