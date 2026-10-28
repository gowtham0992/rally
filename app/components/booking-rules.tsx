import type {Catalog} from '../../src/planning/domain';
import {displayTerms} from '../lib/format';

// These describe the supported booking workflow, not a new merchant promise.
// Published terms stay verbatim and every issued offer keeps its frozen terms.
export function BookingRules(){
 return <dl className="booking-rules">
  <div><dt>When is my share charged?</dt><dd>The studio opens a two-hour approval window. PayPal authorizes your own share first. Rally charges each agreed share automatically once everyone’s payment approval is verified in time. The booking confirms only when every required payment completes.</dd></div>
  <div><dt>If someone drops out during approval</dt><dd>While the approval window is open, withdrawing closes the offer for the whole group. Rally cancels authorizations and refunds any completed charges. Nobody takes over the missing friend’s payment. A new offer needs everyone’s fresh approval. Once payments are being checked, ask the studio to review a cancellation instead.</dd></div>
  <div><dt>If I can’t attend after we book</dt><dd>There is no automatic individual cancellation or refund in Rally. Ask the studio to review a cancellation under its published terms; the booking stays active unless the studio cancels it. Don’t assume a personal absence will be refunded. If the studio cancels the group booking, every completed charge is refunded in full.</dd></div>
  <div><dt>Changing a booking</dt><dd>Rally doesn’t transfer seats, reschedule a confirmed session, or issue partial refunds. A different roster or session needs a new planning round after the old booking is canceled and payment recovery finishes. Refunds and released holds may take time to appear in PayPal.</dd></div>
 </dl>;
}

export default function StudioPolicies({catalog}:{catalog:Catalog}){
 const offerings=catalog.offerings.filter(o=>o.verified);
 const terms=[...new Set(offerings.map(o=>o.cancellationTerms))];
 return <details className="studio-policies">
  <summary>Cancellation & payment timing</summary>
  <p className="field-help">Read this before adding a must-have or approving a payment.</p>
  {terms.length===1?<p className="published-policy"><strong>{catalog.studioName}’s published terms</strong><br/>{displayTerms(terms[0])}</p>:offerings.length?<ul className="published-policies">{offerings.map(o=><li key={o.id}><strong>{o.name}</strong><p>{displayTerms(o.cancellationTerms)}</p></li>)}</ul>:<p className="field-help">The studio hasn’t published cancellation terms yet.</p>}
  <BookingRules/>
  <p className="field-help">If the studio’s terms don’t promise a personal refund window or cutoff, Rally doesn’t add one. Only approve if you’re comfortable with those terms.</p>
 </details>;
}
