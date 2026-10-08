'use client';
import {apiFetch} from '../../lib/api-fetch';
import {useEffect,useRef,useState} from 'react';
import type {ClarificationView} from '../../../src/intake/clarifications';
import type {Proposal} from '../../../src/planning/meaning';

const questions:Record<string,string>={
 TRAVEL_MEANING:'Does leaving affect attending the session or collecting your piece afterward?',
 TECHNIQUE_INTENT:'Which technique is a must-have for you?',
 OUTCOME_INTENT:'What does the session need to let you make?',
 COLLECTION_INTENT:'What needs to happen with your piece after the session?'
};
const values:Record<string,string>={WHEEL:'Using the wheel',HANDBUILD:'Hand-building',DECORATE:'Decorating',FORM_OWN_CUP:'Form my own cup',DECORATE_EXISTING:'Decorate a ready-made piece',SAME_DAY_REQUIRED:'I must take it home that day',SELF_LATER:'I can collect later',NOMINEE_LATER:'I need someone in the group to collect',CANNOT_ATTEND:'I can’t attend',COLLECTION_ONLY:'I can attend; I need someone to collect my piece',OTHER:'Something else',MERCHANT_REVIEW_REQUIRED:'This essential need isn’t covered yet'};
function label(value:string,key:string){return value==='ANY'?(key==='TECHNIQUE'?'Any technique works for me':'I’m open to either kind of piece'):values[value];}
const errors:Record<string,string>={STALE_REVISION:'The plan has changed. Your saved details are safe. Load the latest plan before continuing.',STALE_CLARIFICATION:'This answer belongs to an earlier version of the plan. Load the latest plan before continuing.',CLARIFICATION_LIMIT:'You’ve reached the note-check limit for now. Update your selections or shorten your note. No request has been sent to the studio.',NOTE_TOO_LONG:'Shorten your note to 1,500 characters for this check. No request has been sent to the studio.',NOTE_ALREADY_REVIEWED:'Your note has already been confirmed. Load the latest plan to see your choices.'};

export default function ClarificationPanel({groupId,revision,preferenceId,note,reviewed,disabled,structuredOnly,refresh,onBusyChange,onSessionExpired}:{groupId:string;revision:number;preferenceId:string;note:string;reviewed:boolean;disabled:boolean;structuredOnly:boolean;refresh:()=>void;onBusyChange:(busy:boolean)=>void;onSessionExpired:()=>void}){
 const [view,setView]=useState<ClarificationView|null>(null),[loading,setLoading]=useState(!reviewed),[busy,setBusy]=useState(false),[error,setError]=useState(''),[consent,setConsent]=useState(false),[answer,setAnswer]=useState<string|null>(null),[confirmed,setConfirmed]=useState(false),[structuredConfirmed,setStructuredConfirmed]=useState(false),[reload,setReload]=useState(0),[stale,setStale]=useState(false);
 const command=useRef<{fingerprint:string;id:string}|null>(null),mounted=useRef(true);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useEffect(()=>{
  if(reviewed)return;
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
 },[groupId,revision,preferenceId,reviewed,reload]);
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
   if(action==='START'){setView(result);setAnswer(null);setConfirmed(false);}else setView(v=>v?{...v,status:'DECLINED',proposal:null}:v);
   setReload(n=>n+1);
  }catch(e){if(mounted.current)setError(e instanceof Error?e.message:'Connection interrupted. Try again shortly.');}
  finally{if(mounted.current){setBusy(false);onBusyChange(false);}}
 }
 if(!note)return null;
 if(reviewed)return <section className="clarification"><p className="saved-note">✓ Your saved note is covered by your confirmed choices.</p></section>;
 const proposal=view?.proposal,question=proposal?.question,pending=busy||loading||Boolean(view&&['RESERVED','DISPATCHED'].includes(view.status)),ready=view?.status==='READY'&&proposal;
 return <section id="private-note-review" tabIndex={-1} className="clarification" aria-label="Review your private note"><p className="eyebrow">One more detail</p><h3>Let’s make sure we’ve got you.</h3><p className="muted">Your note stays private. Your choices won’t change until you confirm them.</p>
  {!ready&&<blockquote className="note-quote">{note}</blockquote>}
  {disabled&&<p className="field-help">Save your edits before reviewing this note.</p>}
  {error&&<p className="error" role="alert">{error}</p>}
  {stale&&<button className="text-button" onClick={refresh} disabled={disabled||busy}>Load the latest plan</button>}
  {loading?<p className="field-help" role="status">Loading your note check…</p>:view&&['RESERVED','DISPATCHED'].includes(view.status)?<p className="field-help" role="status">Checking your note. You can leave this page and come back.</p>:ready?<fieldset disabled={disabled||busy}>
   <blockquote className="note-quote">“{[...new Set(proposal.interpretations.map(i=>i.sourceSpan))].join(' … ')}”</blockquote>
   <ProposedDetails proposal={proposal}/>
   {question&&<fieldset className="clarification-options"><legend>{questions[question.templateId]}</legend>{question.options.map(o=><label className="choice" key={o.id}><input type="radio" name="clarification-answer" value={o.id} checked={answer===o.id} onChange={()=>{setAnswer(o.id);setConfirmed(false);}}/><span>{label(o.value,question.requirementKey)}</span></label>)}</fieldset>}
   {question?.options.find(o=>o.id===answer)?.value==='COLLECTION_ONLY'&&<p className="field-help">You’ll choose someone from the group next. They’ll need to agree before we count on them.</p>}
   <label className="choice confirm"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/><span>These details{question?' and my answer':''} cover every must-have in my note.</span></label>
   <button className="button full" disabled={!confirmed||Boolean(question&&!answer)} onClick={()=>act('ANSWER',{clarificationId:view.id,answerId:question?answer:null,confirmsAllEssentials:true})}>{busy?'Saving…':question?'Confirm my answer':'Confirm these details'}</button>
   <button className="text-button keep-choices" onClick={()=>act('DECLINE',{clarificationId:view.id})}>Keep my original choices</button>
  </fieldset>:<>
   {view&&<p className="field-help" role="status">{view.status==='STALE'?'The plan changed during that check. Your choices are unchanged.':view.status==='DECLINED'?'Your original choices are unchanged. Your note still has an unresolved essential need. No studio request has been sent.':'We couldn’t safely turn this note into a choice. Your essential need stays in the plan. No studio request has been sent.'}</p>}
   {!structuredOnly&&!view&&<fieldset disabled={disabled||pending}>
    {note.length>1500?<p className="field-help">Shorten your note to 1,500 characters for this check. No request has been sent to the studio.</p>:<><label className="choice confirm"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/><span>Check my saved note with AI.<small>Only this note and the studio options go to Astropods. Your budget and group details stay out.</small></span></label><button className="secondary full" disabled={!consent} onClick={()=>act('START',{modelProcessingAgreed:true})}>{busy?'Checking…':'Help me clarify this'}</button></>}
   </fieldset>}
  </>}
  {!pending&&<details className="structured-note"><summary>My selections already cover it</summary><p className="field-help">Use this only if your note adds no essential requirement. If your note contains another must-have, keep it and edit your details. The group can’t request a session until every essential need is covered.</p><fieldset disabled={disabled||busy}><label className="choice confirm"><input type="checkbox" checked={structuredConfirmed} onChange={e=>setStructuredConfirmed(e.target.checked)}/><span>My selections are my only must-haves. Nothing else in my note is essential.</span></label><button className="secondary full" disabled={!structuredConfirmed} onClick={()=>act('STRUCTURED',{declaresNoAdditionalMustHaves:true})}>Confirm my selections</button></fieldset></details>}
 </section>;
}
function ProposedDetails({proposal}:{proposal:Proposal}){
 const items=proposal.interpretations.filter(i=>i.certainty==='explicit'&&i.requirementKey!==proposal.question?.requirementKey);
 if(!items.length)return null;
 return <div className="proposed-details"><p className="field-help">Details to confirm</p><ul>{items.map((i,index)=><li key={index}>{label(i.proposedValue,i.requirementKey)}</li>)}</ul></div>;
}
