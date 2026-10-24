import type {AnswerConsequence} from '../../src/planning/consequences';
import {money,localDate} from '../lib/format';

export default function AnswerConsequencePreview({consequence:c}:{consequence:AnswerConsequence}){
 return <span className="answer-consequence">
  {c.state==='NEEDS_REVIEW'?<strong>This need still needs studio review.</strong>:c.state==='NO_MATCH'?<><strong>No published session fits this answer.</strong><span>This group can’t request a session with these choices.</span></>:<>
   <strong>{c.sessions.length===1?'1 session fits your choices':`${c.sessions.length} sessions fit your choices`}</strong>
   {c.sessions.map(s=><span className="consequence-session" key={`${s.offeringId}:${s.slotId}`}><span>{s.activity} · {money(s.amountMinor)} per person</span><span>{localDate(s.startAt,s.timezone)} · {s.timezone}</span></span>)}
   {c.needsCollectionAgreement&&<span className="consequence-condition">If a friend agrees to collect. Choose them after confirming; they must accept the request.</span>}
   {c.needsMeaning&&<span className="consequence-condition">Another must-have still needs an answer.</span>}
   <span>The group’s other requirements and the studio still need to agree.</span>
  </>}
 </span>;
}
