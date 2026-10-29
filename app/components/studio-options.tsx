import type {Catalog} from '../../src/planning/domain';
import {money,localDate} from '../lib/format';
import StudioPolicies from './booking-rules';

export default function StudioOptions({catalog,showDates=true,showPolicies=true}:{catalog:Catalog;showDates?:boolean;showPolicies?:boolean}){
 const offerings=catalog.offerings.filter(o=>o.verified).toSorted((a,b)=>a.priceMinor-b.priceMinor);
 const slots=catalog.slots.filter(s=>offerings.some(o=>o.slotIds.includes(s.id)));
 return <section className="studio-options" aria-label="Published studio activities">
  <div className="section-heading"><h2>At {catalog.studioName}</h2><span>per person</span></div>
  {offerings.length?<ul>{offerings.map(o=><li key={o.id}>
   <div><h3>{o.name}</h3><p>{o.outcome==='DECORATE_EXISTING'?'Decorate an existing piece':o.technique==='WHEEL'?'Form your own cup on the wheel':'Form your own cup by hand'} · {o.durationMinutes} minutes</p></div>
   <strong>{money(o.priceMinor)}</strong>
  </li>)}</ul>:<p className="muted">The studio hasn’t published verified activities yet.</p>}
  {offerings.length>0&&<p className="field-help">{offerings.every(o=>o.requiresLaterCollection)?'Pieces are fired after your visit and picked up later.':'Pickup depends on your activity.'} {offerings.every(o=>o.nomineeCollectionAllowed)?'You can pick up your piece, or ask a friend to agree to pick it up.':'Check the studio’s pickup arrangements before booking.'}</p>}
  {showDates&&<div className="published-dates"><p className="eyebrow">Session times · {catalog.timezone}</p>{slots.length?<ul>{slots.map(s=><li key={s.id}>{localDate(s.startAt,catalog.timezone)}</li>)}</ul>:<p className="field-help">The studio hasn’t published dates yet.</p>}</div>}
  {showPolicies&&<StudioPolicies catalog={catalog}/>}
 </section>;
}
