import type {Candidate} from '../../src/planning/domain';
import {money,localDate,localTime} from '../lib/format';
import {groupSessionOptions} from '../lib/session-options';

export default function SessionOptions({candidates,disabled=false,onRequest}:{candidates:readonly Candidate[];disabled?:boolean;onRequest?:(session:Candidate)=>void}){
 return <ul className="session-options">{groupSessionOptions(candidates).map(activity=><li key={activity.offeringId}>
  <div className="session-option-heading"><h3>{activity.activity}</h3><strong>{money(activity.amountMinor)}<small>/ person</small></strong></div>
  {onRequest&&<p className="field-help">{activity.sessions[0].collectionDescription}</p>}
  <ul className="session-option-dates">{activity.sessions.map(session=><li key={session.slotId}>
   <p>{localDate(session.startAt,session.timezone)}<small>to {localTime(session.endAt,session.timezone)} · {session.timezone}</small></p>
   {onRequest&&<button type="button" className="secondary" disabled={disabled} onClick={()=>onRequest(session)}>Ask the studio <span aria-hidden="true">→</span><span className="sr-only"> for {session.activity}, {localDate(session.startAt,session.timezone)}</span></button>}
  </li>)}</ul>
 </li>)}</ul>;
}
