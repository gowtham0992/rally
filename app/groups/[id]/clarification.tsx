'use client';
import {apiFetch} from '../../lib/api-fetch';
import {useEffect,useRef,useState} from 'react';
import type {ClarificationView} from '../../../src/intake/clarifications';
import type {Proposal} from '../../../src/planning/meaning';
import AnswerConsequencePreview from '../../components/answer-consequence';

import StudioQuestionPanel from './studio-question';
import {questions,label} from '../../lib/requirement-labels';
const errors:Record<string,string>={STALE_REVISION:'The plan has changed. Your saved details are safe. Load the latest plan before continuing.',STALE_CLARIFICATION:'This answer belongs to an earlier version of the plan. Load the latest plan before continuing.',CLARIFICATION_LIMIT:'You’ve reached the note-check limit for now. Update your selections or shorten your note. No request has been sent to the studio.',NOTE_TOO_LONG:'Shorten your note to 1,500 characters for this check. No request has been sent to the studio.',NOTE_ALREADY_REVIEWED:'Your note has already been confirmed. Load the latest plan to see your choices.'};

export default function ClarificationPanel({groupId,revision,preferenceId,note,reviewed,disabled,structuredOnly,refresh,onBusyChange,onSessionExpired,externalConfirmed=false,studioQuestionConfirmed=false,studioQuestionState,studioQuestionExpiry,studioQuestionConflict,studioName,studioContactEmail,priorReviewReason,onStudioConfirmed,reagreementName,embedded=false,primary=true}:{embedded?:boolean;primary?:boolean;externalConfirmed?:boolean;studioQuestionConfirmed?:boolean;studioQuestionState?:'WAITING'|'ANSWERED'|null;studioQuestionExpiry?:'ANSWER_EXPIRED'|'QUESTION_EXPIRED'|null;studioQuestionConflict?:boolean;studioName:string;studioContactEmail?:string;priorReviewReason?:'UNSUPPORTED'|'CONFLICT'|'UNAVAILABLE'|null;onStudioConfirmed?:()=>Promise<void>;reagreementName?:string;groupId:string;revision:number;preferenceId:string;note:string;reviewed:boolean;disabled:boolean;structuredOnly:boolean;refresh:()=>void;onBusyChange:(busy:boolean)=>void;onSessionExpired:()=>void}){
 const [view,setView]=useState<ClarificationView|null>(null),[loading,setLoading]=useState(!reviewed),[busy,setBusy]=useState(false),[error,setError]=useState(''),[answer,setAnswer]=useState<string|null>(null),[structuredConfirmed,setStructuredConfirmed]=useState(false),[studioConfirmed,setStudioConfirmed]=useState(false),[reload,setReload]=useState(0),[stale,setStale]=useState(false);
 const command=useRef<{fingerprint:string;id:string}|null>(null),mounted=useRef(true);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useEffect(()=>{
  if(reviewed||studioQuestionState||studioQuestionExpiry||studioQuestionConflict)return;
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
  async function read(){try{
   const r=await apiFetch(`/api/groups/${groupId}/clarification`,{signal:controller.signal,cache:'no-store'});
   if(r.status===401){onSessionExpired();throw new Error('Sign in again before checking your note. Your saved choices are safe.');}
   if(!r.ok)throw new Error('We couldn’t load the note check. Your saved choices are safe.');
   const result:ClarificationView|null=await r.json();if(controller.signal.aborted)return;
   setView(result);setLoading(false);
   if(result&&['RESERVED','DISPATCHED'].includes(result.status))timer=setTimeout(read,3000);
  }catch(e){if(!controller.signal.aborted){setError(e instanceof Error?e.message:'Connection interrupted.');setLoading(false);}}}
  void read();return()=>{controller.abort();clearTimeout(timer);};
 },[groupId,revision,preferenceId,reviewed,reload,studioQuestionState,studioQuestionExpiry,studioQuestionConflict]);
 async function act(action:'START'|'ANSWER'|'DECLINE'|'STRUCTURED',extra:Record<string,unknown>){
  if(disabled||busy)return;setBusy(true);onBusyChange(true);setError('');setStale(false);
  const payload={groupId,expectedRevision:revision,preferenceId,...extra},fingerprint=JSON.stringify({action,payload});
  if(command.current?.fingerprint!==fingerprint)command.current={fingerprint,id:crypto.randomUUID()};
  try{
   const r=await apiFetch(`/api/groups/${groupId}/clarification`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,payload:{...payload,commandId:command.current.id}})});
   if(r.status===401){onSessionExpired();throw new Error('Sign in again before checking your note. Your saved choices are safe.');}
   const result=await r.json();if(!mounted.current)return;
   if(!r.ok){setStale(['STALE_REVISION','STALE_CLARIFICATION','NOTE_ALREADY_REVIEWED'].includes(result.error));throw new Error(errors[result.error]??'The note check couldn’t finish. Your saved choices are safe. Try again shortly.');}
   if(action==='ANSWER'||action==='STRUCTURED'){refresh();return;}
   if(action==='START'){setView(result);setAnswer(null);}else setView(v=>v?{...v,status:'DECLINED',proposal:null}:v);
   setReload(n=>n+1);
  }catch(e){if(mounted.current)setError(e instanceof Error?e.message:'Connection interrupted. Try again shortly.');}
  finally{if(mounted.current){setBusy(false);onBusyChange(false);}}
 }
 if(!note)return null;
 const relay=<StudioQuestionPanel key={preferenceId} groupId={groupId} preferenceId={preferenceId} studioName={studioName} disabled={disabled} primary={primary} resolved={studioQuestionConfirmed} onDone={refresh} onBusyChange={onBusyChange} onSessionExpired={onSessionExpired}/>;
 if(studioQuestionState||studioQuestionExpiry||studioQuestionConflict||reviewed&&studioQuestionConfirmed)return relay;
 if(reviewed)return <section className="clarification"><p className="saved-note">{externalConfirmed?'You confirmed these needs with the studio yourself. Rally hasn’t verified them.':'✓ Your saved note is covered by your confirmed choices.'}</p></section>;
 const proposal=view?.proposal,question=proposal?.question,pending=busy||loading||Boolean(view&&['RESERVED','DISPATCHED'].includes(view.status)),ready=view?.status==='READY'&&proposal;
 return <section id="private-note-review" tabIndex={-1} className="clarification" aria-label="Review your private note">{!embedded&&<h3>Let’s make sure we’ve got you.</h3>}<p className="muted">Your saved note stays private. You choose whether to share a separate question with the studio. Your choices won’t change until you confirm them.</p>
  {!ready&&<blockquote className="note-quote">{note}</blockquote>}
  {disabled&&<p className="field-help">Save your edits before reviewing this note.</p>}
  {error&&<p className="error" role="alert">{error}</p>}
  {stale&&<button className="text-button" onClick={refresh} disabled={disabled||busy}>Load the latest plan</button>}
  {loading?<p className="field-help" role="status">Loading your note check…</p>:view&&['RESERVED','DISPATCHED'].includes(view.status)?<p className="field-help" role="status">Checking your note. You can leave this page and come back.</p>:ready?<fieldset disabled={disabled||busy}>
   <blockquote className="note-quote">“{[...new Set(proposal.interpretations.map(i=>i.sourceSpan))].join(' … ')}”</blockquote>
   <ProposedDetails proposal={proposal}/>
   {question&&<fieldset className="clarification-options"><legend>{questions[question.templateId]}</legend><p className="field-help">Here’s what each answer changes. These previews use your saved choices and the studio’s published sessions.</p>{question.options.map(o=>{const consequence=view.consequences?.find(c=>c.answerId===o.id);return <label className="choice consequence-choice" key={o.id}><input type="radio" name="clarification-answer" value={o.id} checked={answer===o.id} onChange={()=>{setAnswer(o.id);}}/><span><strong>{label(o.value,question.requirementKey)}</strong>{consequence&&<AnswerConsequencePreview consequence={consequence}/>}</span></label>;})}</fieldset>}
   {!question&&view.consequences?.[0]&&<AnswerConsequencePreview consequence={view.consequences[0]}/>}
   {question?.options.find(o=>o.id===answer)?.value==='COLLECTION_ONLY'&&<p className="field-help">After confirming, choose a friend right here and send a pickup request. They must agree separately.</p>}
   <p className="field-help">Confirm only if these details and your answer cover every must-have in your note. Nothing changes until you confirm.</p>
   <button className={primary?"button full":"secondary full"} disabled={Boolean(question&&!answer)} onClick={()=>act('ANSWER',{clarificationId:view.id,answerId:question?answer:null,confirmsAllEssentials:true})}>{busy?'Saving…':question?(answer?`Confirm: ${label(question.options.find(o=>o.id===answer)!.value,question.requirementKey)}`:'Choose an answer to confirm'):'Confirm these details'}</button>
   <button className="text-button keep-choices" onClick={()=>act('DECLINE',{clarificationId:view.id})}>Keep my original choices</button>
  </fieldset>:<>
   {view&&<p className="field-help" role="status">{view.status==='STALE'?'The plan changed during that check. Your choices are unchanged.':view.status==='DECLINED'?'Your original choices are unchanged. Your note still has an unresolved essential need. No studio request has been sent.':view.review?.reviewReason==='UNSUPPORTED'?'These needs aren’t covered by the form. Keep them in your note. You can ask the studio here about a published session, or use its contact details if available.':view.review?.reviewReason==='CONFLICT'?'Your note contains choices we couldn’t resolve together. Review the quoted needs; none has been dropped.':view.review?.reviewReason==='UNAVAILABLE'?'The AI check didn’t finish. Your note is safe. Retry explicitly or use the form.':'This earlier check left your note unresolved. Keep every need and review the form, or use published studio contact details when available; otherwise the note stays unresolved.'}</p>}
   {view?.review?.reviewEvidence?.map((quote,i)=><blockquote className="note-quote" key={i}>{quote}</blockquote>)}
   {!structuredOnly&&view?.status==='REVIEW'&&view.review?.reviewReason==='UNAVAILABLE'&&<button className="secondary full" disabled={disabled||pending} onClick={()=>act('START',{modelProcessingAgreed:true,retryClarificationId:view.id})}>Retry this AI check</button>}
   {!view&&priorReviewReason==='UNSUPPORTED'&&<p className="field-help">These needs are outside the form. Keep them in your note and ask the studio before continuing. Another AI check cannot verify unpublished studio capabilities.</p>}
   {!view&&priorReviewReason==='UNAVAILABLE'&&<p className="field-help">Your earlier draft didn’t finish. That is different from a need outside the form. Your note is safe; an AI check is optional.</p>}
   {!structuredOnly&&!view&&priorReviewReason!=='UNSUPPORTED'&&<fieldset disabled={disabled||pending}>
    {note.length>1500?<p className="field-help">Shorten your note to 1,500 characters for this check. No request has been sent to the studio.</p>:<><p className="field-help">Pressing Check sends only this saved note and the published studio options to our AI provider, Astropods. Your saved budget and group details stay out. You’ll confirm any proposed meaning before it changes your choices.</p><button className={primary?"button full":"secondary full"} onClick={()=>act('START',{modelProcessingAgreed:true})}>{busy?'Checking…':'Check this note with AI'}</button></>}
   </fieldset>}
  </>}
  {!pending&&!ready&&(priorReviewReason==='UNSUPPORTED'||view?.review?.reviewReason==='UNSUPPORTED'?relay:<details className="structured-note"><summary>Ask the studio about a need the form doesn’t cover</summary><StudioQuestionPanel key={preferenceId} groupId={groupId} preferenceId={preferenceId} studioName={studioName} disabled={disabled} primary={false} onDone={refresh} onBusyChange={onBusyChange} onSessionExpired={onSessionExpired}/></details>)}
  {reagreementName&&<p className="field-help">Confirming new details asks {reagreementName} to agree to pickup again.</p>}
  {!pending&&onStudioConfirmed&&studioContactEmail&&<details className="structured-note" open={priorReviewReason==='UNSUPPORTED'||view?.review?.reviewReason==='UNSUPPORTED'||undefined}><summary>I’ve checked with the studio myself</summary><p className="field-help">Contact the studio yourself about every need in this note. Rally cannot verify accessibility, allergy accommodations or other unpublished capabilities. This button sends no message to the studio. <a href={`mailto:${encodeURIComponent(studioContactEmail)}`}>Contact the studio: {studioContactEmail}</a></p><label className="choice confirm"><input type="checkbox" checked={studioConfirmed} disabled={disabled||busy} onChange={e=>setStudioConfirmed(e.target.checked)}/><span>I’ve confirmed with the studio that they can meet these needs. I understand Rally has not verified this. The studio will see a generic notice that a guest arranged personal needs directly; my name and note will not be attached to that notice.</span></label><button className={primary?"button full":"secondary full"} disabled={!studioConfirmed||disabled||busy} onClick={()=>{if(studioConfirmed)void onStudioConfirmed();}}>Record my confirmation with the studio</button></details>}
  {!pending&&!studioContactEmail&&<p className="field-help">The studio hasn’t published an external contact. Use the private question above when available. Your need stays unresolved until you review a suitable answer or your form honestly covers it.</p>}
  {!pending&&<details className="structured-note"><summary>My form covers these needs</summary><p className="field-help">Use this only if your note adds no essential requirement. If a need is outside the form, keep it in your note and use the studio’s published contact below if available.</p><fieldset disabled={disabled||busy}><label className="choice confirm"><input type="checkbox" checked={structuredConfirmed} onChange={e=>setStructuredConfirmed(e.target.checked)}/><span>I reviewed my note. Every must-have is represented by my form choices.</span></label><button className="secondary full" disabled={!structuredConfirmed} onClick={()=>act('STRUCTURED',{declaresNoAdditionalMustHaves:true})}>Confirm my selections</button></fieldset></details>}
 </section>;
}
function ProposedDetails({proposal}:{proposal:Proposal}){
 const items=proposal.interpretations.filter(i=>i.certainty==='explicit'&&i.requirementKey!==proposal.question?.requirementKey);
 if(!items.length)return null;
 return <div className="proposed-details"><p className="field-help">Details to confirm</p><ul>{items.map((i,index)=><li key={index}>{label(i.proposedValue,i.requirementKey)}</li>)}</ul></div>;
}
