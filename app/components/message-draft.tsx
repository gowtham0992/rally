'use client';
import {useEffect,useRef,useState} from 'react';
import {apiFetch} from '../lib/api-fetch';
import {questions,label} from '../lib/requirement-labels';
import {draftFields,type DraftFields} from '../../src/planning/draft';
import type {MessageDraftView} from '../../src/intake/message-drafts';
export type DraftReview={id:string;answerId:string|null;fields:DraftFields;evidence:{field:keyof DraftFields;quote:string;choice:string}[]};
type Props={groupId:string;sourcePreferenceId:string|null;text:string;mode:'MESSAGE'|'FORM';disabled:boolean;applied:DraftReview|null;draftChanged:boolean;onText:(value:string)=>void;onDraft:(value:DraftReview)=>void;onManual:()=>void;onEdit:()=>void;onBusy:(value:boolean)=>void;onSessionExpired:()=>void};
export default function MessageDraft(p:Props){
 const [view,setView]=useState<MessageDraftView|null>(null),[pending,setPending]=useState(false),[answer,setAnswer]=useState(''),[error,setError]=useState('');
 const version=useRef(0),edited=useRef(false),manual=useRef(false),loaded=useRef(false),applied=useRef(''),command=useRef<{payload:string;id:string}|null>(null),controller=useRef<AbortController|null>(null),mounted=useRef(true);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;controller.current?.abort();};},[]);
 function accept(v:MessageDraftView,id:string|null){try{
  if(!v.proposal||v.status!=='READY'||v.text!==p.text.trim()||v.sourcePreferenceId!==p.sourcePreferenceId)return;
  const fields=draftFields(v.proposal,id),evidence:DraftReview['evidence']=[];
  for(const item of v.proposal.interpretations){const value=v.proposal.question?.requirementKey===item.requirementKey?v.proposal.question.options.find(o=>o.id===id)?.value:item.proposedValue;
   const field=item.requirementKey==='TECHNIQUE'?'technique':item.requirementKey==='OUTCOME'?'outcome':item.requirementKey==='COLLECTION'||item.requirementKey==='TRAVEL'&&value==='COLLECTION_ONLY'?'collection':item.requirementKey==='TRAVEL'&&value==='CANNOT_ATTEND'?'cannotAttend':null;
   if(field)evidence.push({field,quote:item.sourceSpan,choice:label(value??item.proposedValue,item.requirementKey)});
  }
  applied.current=v.id;p.onDraft({id:v.id,answerId:id,fields,evidence});
 }catch{setError('That need isn’t covered by these choices. Keep it in your message and use the form; it will still need review.');}}
 // Resume only this owner's unconfirmed draft. A late read never replaces typing.
 useEffect(()=>{if(p.mode!=='MESSAGE'||loaded.current)return;loaded.current=true;const c=new AbortController(),v=version.current;let finished=false;
  void apiFetch(`/api/groups/${p.groupId}/draft`,{signal:c.signal,cache:'no-store'}).then(async r=>{if(!r.ok)return;const data:MessageDraftView|null=await r.json();if(!c.signal.aborted&&!edited.current&&v===version.current&&data&&data.sourcePreferenceId===p.sourcePreferenceId){p.onText(data.text);setView(data);}}).catch(()=>{}).finally(()=>{if(!c.signal.aborted)finished=true;});
  return()=>{c.abort();if(!finished)loaded.current=false;};
 },[p.groupId,p.sourcePreferenceId,p.mode]);
 useEffect(()=>{if(p.mode==='MESSAGE'&&!manual.current&&view?.status==='READY'&&view.proposal&&!view.proposal.question&&applied.current!==view.id&&!p.disabled)accept(view,null);},[view,p.mode,p.disabled,p.text]);
 useEffect(()=>{if(!view||!['RESERVED','DISPATCHED'].includes(view.status)||manual.current)return;const v=version.current,c=new AbortController();
  const timer=setTimeout(()=>{void apiFetch(`/api/groups/${p.groupId}/draft`,{signal:c.signal,cache:'no-store'}).then(async r=>{if(!r.ok)throw Error();const data:MessageDraftView|null=await r.json();if(v!==version.current||c.signal.aborted)return;if(!data||data.id!==view.id){setError('This draft changed in another window. Your message is still here; use the form or draft it again.');setView(null);}else setView(data);}).catch(()=>{if(!c.signal.aborted){setError('We couldn’t check the draft. Your message is still here. You can use the form.');setView(null);}});},1500);
  return()=>{clearTimeout(timer);c.abort();};
 },[view,p.groupId]);
 function change(value:string){edited.current=true;version.current++;controller.current?.abort();setPending(false);p.onBusy(false);setView(null);setAnswer('');setError('');applied.current='';p.onText(value);}
 function useManual(){manual.current=true;edited.current=true;version.current++;controller.current?.abort();setPending(false);p.onBusy(false);p.onManual();}
 async function start(){if(p.disabled||pending||!p.text.trim()||p.text.trim().length>1500)return;
  manual.current=false;const v=++version.current,c=new AbortController();controller.current?.abort();controller.current=c;setPending(true);p.onBusy(true);setError('');setView(null);setAnswer('');applied.current='';
  const payload={groupId:p.groupId,sourcePreferenceId:p.sourcePreferenceId,text:p.text.trim(),modelProcessingAgreed:true},key=JSON.stringify(payload);if(command.current?.payload!==key)command.current={payload:key,id:crypto.randomUUID()};
  try{const r=await apiFetch(`/api/groups/${p.groupId}/draft`,{method:'POST',signal:c.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,commandId:command.current.id})});
   if(r.status===401){p.onSessionExpired();throw Error('Sign in again to continue. Your message is still here.');}
   const data=await r.json();if(!r.ok)throw Error(data.error==='CLARIFICATION_LIMIT'?'You’ve reached the message-check limit. Use the form; your message is still here.':['STALE_PREFERENCE','PLANNING_LOCKED'].includes(data.error)?'Your saved plan changed. Refresh before drafting again; your message is still here.':'We couldn’t draft your choices. Your message is still here; use the form or retry the same request.');
   if(v===version.current&&!c.signal.aborted&&mounted.current){if(!data){command.current=null;throw Error('This draft is no longer current. Your message is still here.');}setView(data);}
  }catch(e){if(v===version.current&&!c.signal.aborted&&mounted.current)setError(e instanceof Error?e.message:'We couldn’t draft your choices. Use the form.');}
  finally{if(v===version.current&&mounted.current){setPending(false);p.onBusy(false);}}
 }
 const q=view?.status==='READY'?view.proposal?.question:null,working=pending||Boolean(view&&['RESERVED','DISPATCHED'].includes(view.status));
 if(p.mode==='FORM')return <section className="message-summary" aria-label="Your message draft">
  {p.text.trim()?<details><summary>{p.applied&&!p.draftChanged?'Choices drafted from your message':'Your message'} <span>Private</span></summary><blockquote className="note-quote">{p.text}</blockquote>{p.applied&&view?.proposal&&<ul className="draft-evidence">{view.proposal.interpretations.map((i,n)=><li key={n}><q>{i.sourceSpan}</q><span> → {label(i.requirementKey===q?.requirementKey?(q.options.find(o=>o.id===p.applied?.answerId)?.value??i.proposedValue):i.proposedValue,i.requirementKey)}</span></li>)}</ul>}</details>:<p className="field-help">Set your dates, spending limit and choices below.</p>}
  <button type="button" className="text-button" disabled={p.disabled} onClick={()=>{manual.current=false;p.onEdit();}}> {p.text?'Edit my message':'Describe my plans instead'}</button>

 </section>;
 return <section className="message-first" aria-label="Describe your plans"><p>Write it like you’d text your friends. We’ll draft activity and pickup choices for you to check. You’ll set dates and your spending limit next.</p><label htmlFor="plan-message">What works for you?</label><textarea id="plan-message" value={p.text} onChange={e=>change(e.target.value)} maxLength={1500} rows={4}/>
  <p className="field-help">Pressing Draft sends this message and the public studio options to Astropods. Anything you type here is sent. Your saved spending limit, date selections and friends’ details aren’t included.</p>
  {error&&<p className="error" role="alert">{error}</p>}
  {view?.status==='REVIEW'&&<p className="field-help" role="status">We couldn’t draft these choices. Your message is still here. Use the form and keep every must-have; anything it doesn’t cover will still need review.</p>}
  {q?<fieldset disabled={p.disabled||pending}><legend>{questions[q.templateId]}</legend>{q.options.map(o=><label className="choice" key={o.id}><input type="radio" name="draft-answer" value={o.id} checked={answer===o.id} onChange={()=>setAnswer(o.id)}/><span>{label(o.value,q.requirementKey)}</span></label>)}<button type="button" className="button full" disabled={!answer} onClick={()=>{if(view)accept(view,answer);}}>Use this answer →</button></fieldset>:working?<p role="status" className="field-help">Drafting your choices… You can switch to the form while we check.</p>:<button type="button" className="button full" disabled={p.disabled||!p.text.trim()||p.text.trim().length>1500||Boolean(view&&['REVIEW','STALE'].includes(view.status))} onClick={start}>Draft my choices →</button>}
  <button type="button" className="text-button keep-choices" onClick={useManual}>Choose everything myself →</button>
 </section>;
}

export function DraftEvidence({review,fields,changed}:{review:DraftReview|null;fields:(keyof DraftFields)[];changed:boolean}){const evidence=review?.evidence.filter(e=>fields.includes(e.field))??[];return <>{evidence.map((e,i)=><p className="field-help draft-field-evidence" key={i}><q>{e.quote}</q><br/>{changed?'Earlier draft':'Draft'}: {e.choice}</p>)}</>;}
