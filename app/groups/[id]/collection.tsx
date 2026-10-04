'use client';
import {useState} from 'react';
import type {CollectionRequest} from '../../../src/intake/projections';
export default function CollectionPanel({requests,editable,disabled,busy,error,stale,refresh,onConsent,studioConfirmed}:{requests:CollectionRequest[];studioConfirmed:boolean;editable:boolean;disabled:boolean;busy:boolean;error:string;stale:boolean;refresh:()=>void;onConsent:(request:CollectionRequest,action:'OWNER_AGREE'|'NOMINEE_AGREE'|'REVOKE')=>Promise<void>}){
 if(!requests.length)return null;
 return <section className="collection-panel" aria-label="Collection arrangements"><p className="eyebrow">After firing</p><h3>A little help from a friend.</h3><p className="muted">Collection needs both people’s agreement before it can be part of the plan.</p>{disabled&&!busy&&<p className="field-help">Save your edits before changing an arrangement.</p>}{error&&<p className="error" role="alert">{error}</p>}{stale&&<button className="text-button" disabled={disabled||busy} onClick={refresh}>Load the latest plan</button>}{requests.map(request=><Arrangement key={request.preferenceId+request.role} request={request} studioConfirmed={studioConfirmed} editable={editable} disabled={disabled} busy={busy} onConsent={onConsent}/>)}</section>;
}
function Arrangement({request:r,editable,disabled,busy,onConsent,studioConfirmed}:{request:CollectionRequest;studioConfirmed:boolean;editable:boolean;disabled:boolean;busy:boolean;onConsent:(request:CollectionRequest,action:'OWNER_AGREE'|'NOMINEE_AGREE'|'REVOKE')=>Promise<void>}){
 const [agreed,setAgreed]=useState(false);
 const complete=r.ownerAgreed&&r.nomineeAgreed&&!r.revoked,needsAgreement=!r.revoked&&(r.role==='OWNER'?!r.ownerAgreed:!r.nomineeAgreed);
 return <div className="collection-arrangement">
  <p className="arrangement-title">{r.role==='OWNER'?`${r.nomineeName} would collect your piece.`:`${r.ownerName} would like you to collect their piece.`}</p>
  {r.role==='OWNER'&&needsAgreement&&<p className="field-help">Your friend will see this request when you agree to share it. The studio will see the arrangement if you book. Your private note and spending limit won’t be shared.</p>}
  {r.revoked?<p className="field-help" role="status">This arrangement has been withdrawn. {r.role==='OWNER'?'Update your collection choice above to make a new arrangement.':'You’re no longer being counted on to collect.'}</p>:complete?<p className="saved-note" role="status">✓ You’ve both agreed. {studioConfirmed?'This arrangement is included in the studio’s offer.':'The studio still needs to confirm the session.'}</p>:!needsAgreement?<p className="field-help" role="status">Waiting for {r.nomineeName} to agree. They’ll see the request when they open this plan.</p>:editable?<fieldset disabled={disabled||busy}>
   <label className="choice confirm"><input type="checkbox" checked={agreed} onChange={e=>setAgreed(e.target.checked)}/><span>{r.role==='OWNER'?`I’d like ${r.nomineeName} to collect my piece after firing. Share this arrangement with them now and with the studio if we book.`:`I agree to collect ${r.ownerName}’s piece after firing. Share this arrangement with the studio if we book.`}</span></label>
   <button className="secondary full" disabled={!agreed} onClick={()=>onConsent(r,r.role==='OWNER'?'OWNER_AGREE':'NOMINEE_AGREE')}>{busy?'Saving…':r.role==='OWNER'?`Ask ${r.nomineeName} to collect`:'I’ll collect their piece'}</button>
  </fieldset>:<p className="field-help">This arrangement needs attention. The issued offer must be reviewed before it can change.</p>}
  {editable&&!r.revoked&&(r.ownerAgreed||r.nomineeAgreed)&&<button className="text-button keep-choices" disabled={disabled||busy} onClick={()=>onConsent(r,'REVOKE')}>{r.role==='OWNER'?'Withdraw this arrangement':'I can’t collect after all'}</button>}
  {!editable&&!r.revoked&&<p className="field-help">To change collection after an offer is issued, the booking needs cancellation review.</p>}
 </div>;
}
