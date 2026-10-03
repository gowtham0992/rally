'use client';
import Link from 'next/link';
import {useRef,useState} from 'react';
import type {BookingService} from '../../../src/bookings/service';
import {apiFetch} from '../../lib/api-fetch';
import {useResource} from '../../lib/use-resource';
import {localDate,money} from '../../lib/format';
type Cases=Awaited<ReturnType<BookingService['merchantExceptions']>>;
const labels:Record<string,string>={CREATE_ORDER:'Checkout',AUTHORIZE:'Authorization',CAPTURE:'Payment',VOID:'Authorization release',REFUND:'Refund'};
export default function Exceptions({cursor}:{cursor:string|null}){
 const {data,loading,error,refresh}=useResource<Cases>(`/api/studio/exceptions${cursor?`?cursor=${encodeURIComponent(cursor)}`:''}`,'/m/exceptions',10000,true);
 const busy=useRef(false),[checking,setChecking]=useState<string|null>(null),[message,setMessage]=useState(''),[actionError,setActionError]=useState('');
 async function check(offerId:string,operationId:string){
  if(busy.current)return;busy.current=true;setChecking(operationId);setMessage('');setActionError('');
  try{
   const response=await apiFetch('/api/studio/exceptions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({commandId:crypto.randomUUID(),offerId,operationId})});
   if(!response.ok)throw new Error(response.status===401?'Your session expired. Sign in again.':response.status===409?'This payment changed or is already being checked. Refresh to see its current status.':'We couldn’t request a check. Try again shortly.');
   setMessage('Check requested. We’ll show any verified update here.');refresh();
  }catch(e){setActionError(e instanceof TypeError?'Connection interrupted. Try again.':e instanceof Error?e.message:'We couldn’t request a check. Try again shortly.');}
  finally{busy.current=false;setChecking(null);}
 }
 return <main className="studio-layout"><section className="studio-heading"><Link className="back-link" href="/studio">← Your studio</Link><p className="eyebrow">Payment resolution</p><h1 className="page-title">Payments to check.</h1><p className="muted">Follow unfinished payments and refunds for your studio’s sessions.</p><p className="field-help">A status check verifies the existing payment. It does not start another charge.</p></section>
 <section className="card" aria-label="Payment resolution"><div className="card-top"><p className="eyebrow">Awaiting verification</p><button className="text-button" onClick={refresh} disabled={loading||checking!==null}>Refresh payments</button></div>
 {message&&<p role="status" className="field-help">{message}</p>}{actionError&&<p role="alert" className="error">{actionError}</p>}
 {loading&&!data?<p aria-busy="true">Checking your payments…</p>:error?<><p className="error" role="alert">{error}</p><button className="secondary" onClick={refresh}>Try again</button></>:data&&<>
 {data.exceptions.length?<ul className="resolution-list">{data.exceptions.map(item=><li key={item.offerId}><div className="card-top"><div><p className="eyebrow">{item.booking==='CONFIRMED'?'Booking confirmed':item.booking==='CANCELED'?'Session canceled':item.booking==='SETTLING'?'Booking not yet confirmed':item.booking==='OPEN'?'Booking window open':'Booking closed'}</p><h2>{item.activity}</h2><p className="field-help">{item.studioName} · {item.groupSize} people</p><p className="field-help">{localDate(item.startAt,item.timezone)} · {item.timezone}</p></div><Link className="text-button" href={`/offers/${item.offerId}`}>View booking ↗</Link></div>
 {(item.awaitingVerifiedRefundMinor>0||item.uncertainCaptureMinor>0||item.authorizationAwaitingReleaseMinor>0)&&<dl className="resolution-amounts">
 {item.awaitingVerifiedRefundMinor>0&&<div><dt>Refunds awaiting verification</dt><dd>{money(item.awaitingVerifiedRefundMinor)}</dd></div>}
 {item.uncertainCaptureMinor>0&&<div><dt>Payment outcome unknown</dt><dd>{money(item.uncertainCaptureMinor)}</dd></div>}
 {item.authorizationAwaitingReleaseMinor>0&&<div><dt>Authorization release to verify</dt><dd>{money(item.authorizationAwaitingReleaseMinor)}</dd></div>}
 </dl>}
 <ul className="resolution-operations">{item.operations.map(op=><li key={op.operationId}><div><h3>{op.memberName} · {labels[op.kind]}</h3><p className="field-help">{op.state==='FAILED'?'This did not complete. Review the PayPal record before deciding the next step.':op.state==='PENDING'?'PayPal has not reported a final outcome.':'The payment outcome needs verification.'}</p><details className="resolution-reference"><summary>Payment references</summary><p>PayPal: {op.providerReference??'Not available yet'}</p>{op.originalProviderReference&&<p>Original {op.kind==='VOID'?'authorization':'payment'}: {op.originalProviderReference}</p>}<p>Rally: {op.operationId}</p></details><Link className="text-button" href={`/m/payments/${op.operationId}`}>Review payment record ↗</Link></div>{op.canCheck?<button className="secondary" disabled={checking!==null||loading} onClick={()=>void check(item.offerId,op.operationId)} aria-label={`Check ${op.memberName} ${labels[op.kind].toLowerCase()} status`}>{checking===op.operationId?'Requesting check…':'Check payment status'}</button>:op.state!=='FAILED'&&<p className="field-help">A check is already running or is not ready yet.</p>}</li>)}</ul></li>)}</ul>:<div className="empty-request"><h2>Nothing needs a check.</h2><p className="muted">Unfinished payments and refunds will appear here. Your bookings stay in your studio.</p><Link className="secondary" href="/studio">Back to your studio →</Link></div>}
 <nav className="queue-navigation" aria-label="Payment history pages">{cursor&&<Link className="text-button" href="/m/exceptions">Back to newest payments</Link>}{data.nextCursor&&<Link className="secondary" href={`/m/exceptions?cursor=${data.nextCursor}`}>Older payments →</Link>}</nav></>}
 </section></main>;
}
