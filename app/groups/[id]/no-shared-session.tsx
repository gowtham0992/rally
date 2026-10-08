'use client';
import {useState} from 'react';

export default function NoSharedSession({groupId,studioName,isOrganizer,disabled,onReview}:{groupId:string;studioName:string;isOrganizer:boolean;disabled:boolean;onReview:()=>void}){
 const [kept,setKept]=useState(false),[message,setMessage]=useState(''),[copied,setCopied]=useState(false);
 async function copy(){
  // Only public studio context and an authenticated group link enter this text.
  // Never copy an individual's budget, note, availability or inferred blocker.
  const text=`No published session at ${studioName} fits our group yet. Please check your own choices in Rally and keep any must-haves. Can we agree on another date or activity, or a different outing?\n${location.origin}/groups/${encodeURIComponent(groupId)}`;
  setMessage(text);setCopied(false);
  try{await navigator.clipboard.writeText(text);setCopied(true);}catch{/* Keep a selectable fallback. */}
 }
 return <div className="no-shared-session">
  <h3>No published session works with everyone’s saved choices.</h3>
  <p>Your choices are unchanged. No studio request has been sent.</p>
  <p className="field-help">{isOrganizer?'Check in with your friends about another date or activity, or a different outing.':'Ask your organizer about another date or activity, or a different outing.'} Keep any must-haves; you don’t need to share your spending limit.</p>
  <div className="fit-actions"><button type="button" className="text-button" disabled={disabled} onClick={onReview}>Review my choices</button><button type="button" className="text-button" disabled={disabled} onClick={()=>setKept(true)}>Keep my choices</button></div>
  {kept&&<p className="field-help" role="status">Your choices are unchanged. No payment approval is needed for this planning round.</p>}
  <button type="button" className="secondary full" disabled={disabled} onClick={copy}>Copy a group check-in ↗</button>
  {message&&<><p className="field-help" role="status">{copied?'Check-in copied. Share it in your group chat.':'Select and copy the check-in below.'} Your private choices aren’t included.</p><label htmlFor="group-check-in">Group check-in</label><textarea id="group-check-in" readOnly value={message} rows={5} onFocus={e=>e.target.select()}/></>}
 </div>;
}
