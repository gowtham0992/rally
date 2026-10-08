import type {StudioDecline} from '../../src/intake/service';
import type {Candidate} from '../../src/planning/domain';
import {money,localDate,localTime} from '../lib/format';
import {groupSessionOptions} from '../lib/session-options';

export default function SessionOptions({candidates,disabled=false,onRequest,declinedSession}:{candidates:readonly Candidate[];declinedSession?:StudioDecline|null;disabled?:boolean;onRequest?:(session:Candidate)=>void}){
 return <ul className="session-options">{groupSessionOptions(candidates).map(activity=><li key={activity.offeringId}>
  <div className="session-option-heading"><h3>{activity.activity}</h3><strong>{money(activity.amountMinor)}<small>/ person</small></strong></div>
  {onRequest&&<p className="field-help">{activity.sessions[0].collectionDescription}</p>}
  <ul className="session-option-dates">{activity.sessions.map(session=>{const declined=declinedSession?.catalogVersionId===session.catalogVersionId&&declinedSession.offeringId===session.offeringId&&declinedSession.slotId===session.slotId;return <li key={session.slotId}>
   <p>{localDate(session.startAt,session.timezone)}<small>to {localTime(session.endAt,session.timezone)} · {session.timezone}</small></p>
   {declined&&<p className="field-help">The studio declined this option. A new request needs another answer from them.</p>}
   {onRequest&&<button type="button" className="secondary" disabled={disabled} onClick={()=>onRequest(session)}>{declined?'Ask the studio again':'Ask the studio'} <span aria-hidden="true">→</span><span className="sr-only"> for {session.activity}, {localDate(session.startAt,session.timezone)}</span></button>}
  </li>;})}</ul>
 </li>)}</ul>;
}
