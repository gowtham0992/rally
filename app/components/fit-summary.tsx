import {matchingSessions,type Catalog,type Preference,type PlanningResult} from '../../src/planning/domain';
import {personalFit} from '../lib/personal-fit';

export default function FitSummary({catalog,preference,groupSize,collectionAgreed=false,candidate=null,draft=false}:{catalog:Catalog;preference:Preference|null;groupSize:number;collectionAgreed?:boolean;candidate?:PlanningResult|null;draft?:boolean}){
 const fit=preference?personalFit(catalog,preference,groupSize,collectionAgreed):null;
 const total=matchingSessions(catalog,[],groupSize).length;
 const shared=!draft&&candidate?.state==='CANDIDATE_READY';
 const title=shared?`${candidate.candidates.length} ${candidate.candidates.length===1?'session fits':'sessions fit'} everyone’s confirmed choices.`:!fit?'Let’s find your fit.':!fit.sessions.length?'No published session fits your choices yet.':fit.pendingNote?'Your note needs a check.':fit.pendingMeaning?'One of your must-haves needs an answer.':preference?.collection==='UNRESOLVED'?'Decide how your piece will be picked up.':fit.pendingCollection?'Your pickup plan needs agreement.':`${fit.sessions.length} of ${total} published sessions fit your choices.`;
 return <section className="fit-summary" aria-label="Session fit summary" aria-live="polite"><p className="eyebrow">{shared?'Your group’s fit':draft?'Your fit · Unsaved preview':'Your fit · Private'}</p><h3>{title}</h3><p className="field-help">{shared?'Choose a session together, then ask the studio to reserve it.':!fit?'Add your limit and dates below. You’ll see what works as you go.':fit.pendingNote?'Review your saved note below before the group requests a session.':preference?.collection==='UNRESOLVED'?'Your group can’t ask the studio until you decide.':fit.pendingCollection?'A possible session is not an agreed pickup arrangement.':draft?'Based on your edits. Save them before the group can use them.':'Your group’s other requirements and the studio still need to agree.'}</p></section>;
}
