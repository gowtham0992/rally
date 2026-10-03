'use client';
import Link from 'next/link';
import {useRef,useState,type FormEvent} from 'react';
import type {BookingService} from '../../../../src/bookings/service';
import {apiFetch} from '../../../lib/api-fetch';
import {useResource} from '../../../lib/use-resource';
import {localDate,money} from '../../../lib/format';
type RecordPage=Awaited<ReturnType<BookingService['merchantPaymentRecord']>>;
type Source='TRANSACTION'|'SUPPORT_CASE';
type Outcome='COMPLETED'|'PENDING'|'FAILED'|'UNRESOLVED';
const kinds:Record<string,string>={CREATE_ORDER:'Checkout',AUTHORIZE:'Authorization',CAPTURE:'Payment',VOID:'Authorization release',REFUND:'Refund'};
const outcomes:Record<Outcome,string>={COMPLETED:'Completed',PENDING:'Pending',FAILED:'Failed',UNRESOLVED:'Not clear'};
function paymentStatus(data:RecordPage){
 if(data.state==='SUCCEEDED')return ({CREATE_ORDER:'Checkout created',AUTHORIZE:'Authorization verified',CAPTURE:'Payment completed',VOID:'Authorization released',REFUND:'Refund completed'} as Record<string,string>)[data.kind];
 if(data.state==='PENDING')return 'Awaiting a final PayPal result';
 if(data.state==='FAILED')return 'Did not complete';
 if(data.state==='DISPATCHED')return 'Checking with PayPal';
 if(data.state==='PLANNED')return 'Waiting to be processed';
 return 'Outcome needs verification';
}
export default function PaymentRecord({operationId,cursor}:{operationId:string;cursor:string|null}){
 const path=`/m/payments/${operationId}`,{data,loading,error,refresh}=useResource<RecordPage>(`/api/studio/payment-evidence?operationId=${operationId}${cursor?`&cursor=${encodeURIComponent(cursor)}`:''}`,path,0,true);
 const [source,setSource]=useState<Source>('TRANSACTION'),[reference,setReference]=useState(''),[outcome,setOutcome]=useState<Outcome>('UNRESOLVED');
 const [draftState,setDraftState]=useState<string|null>(null),[saving,setSaving]=useState(false),[message,setMessage]=useState(''),[actionError,setActionError]=useState(''),[signIn,setSignIn]=useState(false);
 const busy=useRef(false),command=useRef<{id:string;key:string}|null>(null);
 const stale=Boolean(data&&draftState&&draftState!==data.state);
 function editing(){if(!draftState&&data)setDraftState(data.state);setMessage('');setActionError('');}
 async function save(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(busy.current||!data?.canRecord||stale||loading||error)return;
  const normalized=reference.trim().toUpperCase();
  if(!/^[A-Z0-9][A-Z0-9-]{2,63}$/.test(normalized)){setActionError('Use the PayPal reference: 3–64 letters, numbers or hyphens.');return;}
  const payload={operationId,expectedOperationState:draftState??data.state,source,reference:normalized,reportedOutcome:outcome},key=JSON.stringify(payload);
  if(command.current?.key!==key)command.current={id:crypto.randomUUID(),key};
  busy.current=true;setSaving(true);setMessage('');setActionError('');setSignIn(false);
  try{
   const response=await apiFetch('/api/studio/payment-evidence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({commandId:command.current.id,...payload})});
   if(!response.ok){
    const code=await response.json().catch(()=>({error:''}));
    if(response.status===401){setSignIn(true);throw new Error('Your session expired. Sign in again to save your record.');}
    if(code.error==='PAYMENT_EVIDENCE_LIMIT')throw new Error('This payment has reached its record limit. Your draft has not been saved.');
    if(response.status===409)throw new Error('This payment changed. Refresh its status before saving. Your draft is still here.');
    if(response.status===429)throw new Error('Please wait a minute before trying again. Your draft is still here.');
    throw new Error('We couldn’t save this record. Your draft is still here. Try again.');
   }
   command.current=null;setReference('');setDraftState(null);
   setMessage('Record saved. Payment status still comes from verified PayPal results.');refresh();
  }catch(e){setActionError(e instanceof TypeError?'Connection interrupted. Retry to check and save this same record.':e instanceof Error?e.message:'We couldn’t save this record. Try again.');}
  finally{busy.current=false;setSaving(false);}
 }
 return <main className="studio-layout payment-record"><section className="studio-heading"><Link className="back-link" href="/m/exceptions">← Payments to check</Link><p className="eyebrow">Your studio</p><h1 className="page-title">Payment record.</h1>{data&&<><p className="muted">{data.memberName} · {kinds[data.kind]}</p><p className="field-help">{data.activity}</p><Link className="text-button" href={`/offers/${data.offerId}`}>View booking ↗</Link></>}</section>
 <section className="card" aria-label="Studio payment record"><div className="card-top"><p className="eyebrow">{error?"Last loaded payment status":"Current payment status"}</p><button className="text-button" onClick={refresh} disabled={loading||saving}>Refresh status</button></div>
 {loading&&!data&&<p aria-busy="true">Opening this payment…</p>}
 {error&&<><p className="error" role="alert">{error}</p><button className="secondary" disabled={loading||saving} onClick={refresh}>Try again</button></>}
 {data&&<><h2 className="payment-record-status">{paymentStatus(data)}</h2><p className="field-help">{money(data.amountMinor)} · {kinds[data.kind].toLowerCase()} for {data.memberName}</p>
 <p className="field-help">{data.state==='SUCCEEDED'?'Verified from PayPal.':data.state==='FAILED'?'This operation has a failed result. Review its PayPal record for the next step.':'A studio report does not confirm a payment or refund.'}</p>
 <details className="resolution-reference"><summary>Payment references</summary><p>PayPal: {data.providerReference??'Not available yet'}</p>{data.originalProviderReference&&<p>Original {data.kind==='REFUND'?'payment':data.kind==='AUTHORIZE'?'checkout':'authorization'}: {data.originalProviderReference}</p>}<p>Rally: {operationId}</p></details>
 <section className="payment-evidence-history" aria-label="Studio report history"><h3>Studio reports</h3><p className="field-help">These are the studio’s observations. The verified payment status is shown above.</p>
 {data.records.length?<ol>{data.records.map(record=><li key={record.id}><p className="eyebrow">Studio report · Unverified</p><h4>Reported {outcomes[record.reportedOutcome].toLowerCase()}</h4><p className="evidence-ref">{record.source==='TRANSACTION'?'Transaction':'Support case'} · {record.reference}</p><p className="field-help">{localDate(record.recordedAt,data.timezone)} · {data.timezone}</p></li>)}</ol>:<p className="muted">No studio reports yet.</p>}
 <nav className="queue-navigation" aria-label="Studio report pages">{cursor&&<Link className="text-button" href={path}>Back to newest reports</Link>}{data.nextCursor&&<Link className="secondary" href={`${path}?cursor=${data.nextCursor}`}>Older reports →</Link>}</nav></section>
 {(data.canRecord||reference)&&<section className="payment-observation" aria-label="Record a studio observation"><h3>What did you find?</h3><p className="muted">After reviewing PayPal, save the transaction or support-case reference and the outcome it shows.</p>
 <form onSubmit={save}><fieldset disabled={saving||loading||Boolean(error)||!data.canRecord}><label htmlFor="evidence-source">Where you checked</label><select id="evidence-source" value={source} onChange={e=>{editing();setSource(e.target.value as Source);}}><option value="TRANSACTION">PayPal transaction</option><option value="SUPPORT_CASE">PayPal support case</option></select>
 <label htmlFor="evidence-reference">{source==='TRANSACTION'?'Transaction reference':'Support-case reference'}</label><input id="evidence-reference" value={reference} maxLength={64} required autoComplete="off" autoCapitalize="characters" spellCheck={false} aria-describedby="reference-help" onChange={e=>{editing();setReference(e.target.value);}}/><p id="reference-help" className="field-help">Only the reference. Leave out names, emails and private notes.</p>
 <label htmlFor="evidence-outcome">Outcome shown in PayPal</label><select id="evidence-outcome" value={outcome} onChange={e=>{editing();setOutcome(e.target.value as Outcome);}}>{Object.entries(outcomes).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>
 <p className="field-help">Saved as an unverified studio report. This does not charge, refund or change payment status. Records cannot be edited or removed.</p>
 {stale&&<p className="error" role="alert">The current status changed while you were writing. Review it above before saving.</p>}
 {stale&&data.canRecord&&<button type="button" className="text-button" onClick={()=>{setDraftState(data.state);setActionError('');}}>I’ve reviewed the current status</button>}
 <button className="button" disabled={stale||!reference.trim()}>{saving?'Saving record…':'Save studio report'}</button></fieldset></form></section>}
 {!data.canRecord&&<p className="field-help">{data.recordLimitReached?'This payment has reached its record limit. Previous reports are kept below.':'New reports are available while a payment needs resolution. Previous reports are kept below.'}</p>}
</>}
 {message&&<p role="status" className="saved-note">{message}</p>}{actionError&&<p role="alert" className="error">{actionError}</p>}{signIn&&<Link className="secondary" href={`/login?next=${encodeURIComponent(path)}`}>Sign in again →</Link>}
 </section></main>;
}
