import type {Catalog,Preference} from '../../src/planning/domain';
import {personalFit} from '../lib/personal-fit';
import SessionOptions from './session-options';

export default function PersonalFit({catalog,preference,groupSize,collectionAgreed=false}:{catalog:Catalog;preference:Preference|null;groupSize:number;collectionAgreed?:boolean}){
 const fit=preference?personalFit(catalog,preference,groupSize,collectionAgreed):null;
 const pending=fit&&(fit.pendingNote||fit.pendingCollection||fit.pendingMeaning);
 return <section className="personal-fit" aria-label="Your private session preview">
  <p className="eyebrow">Just for you · Private</p>
  <h3>{!fit?'See what could work for you.':!fit.sessions.length?'No published session meets these choices.':fit.pendingNote||fit.pendingMeaning?'We can’t check every must-have yet.':pending?'These sessions could work for you.':'These sessions meet your choices.'}</h3>
  {!fit?<p className="field-help">Add your spending limit and dates to check the published sessions.</p>:<>
   {!fit.sessions.length&&<p className="field-help">{fit.message??'Your choices stay yours. You can save them even if none of these sessions work.'}</p>}
   {fit.pendingNote&&<p className="field-help">Your note still needs an answer before the group can request a session.{fit.sessions.length>0?' The sessions below fit your structured choices only.':''}</p>}
   {fit.pendingMeaning&&<p className="field-help">One of your saved must-haves still needs an answer. These are possibilities, not a finished fit check.</p>}
   {fit.pendingCollection&&<p className="field-help">{preference?.collection==='NOMINEE_LATER'?'You still need an agreed collector. Choosing a friend does not mean they have agreed.':'You still need to decide how your piece will be collected.'}</p>}
   {fit.sessions.length>0&&<SessionOptions candidates={fit.sessions}/>}
   <p className="fit-disclaimer">Your group and the studio still need to agree. This preview does not reserve a session or approve a payment.</p>
  </>}
 </section>;
}
