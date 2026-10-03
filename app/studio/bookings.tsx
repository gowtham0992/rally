'use client';
import Link from 'next/link';
import {useState} from 'react';
import type {BookingService} from '../../src/bookings/service';
import {useResource} from '../lib/use-resource';
import {localDate} from '../lib/format';
type Bookings=Awaited<ReturnType<BookingService['merchantBookings']>>;
export default function StudioBookings(){
 const [cursor,setCursor]=useState<string|null>(null),{data,loading,error,refresh}=useResource<Bookings>(`/api/studio/bookings${cursor?`?cursor=${cursor}`:''}`,'/studio',10000);
 const state=(s:string)=>s==='OPEN'?'Waiting for payment approvals':s==='SETTLING'?'Payments being checked':s==='CONFIRMED'?'Booking confirmed':s==='CANCELED'?'Session canceled':'Booking closed';
 return <section className="studio-bookings" aria-label="Studio bookings"><div className="card-top"><p className="eyebrow">Reserved sessions & recent bookings</p><button className="text-button" disabled={loading} onClick={refresh}>Refresh bookings</button></div>{loading?<p aria-busy="true">Checking your bookings…</p>:error?<><p className="error" role="alert">{error}</p><button className="secondary" onClick={refresh}>Try again</button></>:data&&<>{data.bookings.length?<ul className="studio-request-list">{data.bookings.map(b=><li key={b.offerId}><Link href={`/offers/${b.offerId}`}><div><p className="eyebrow">{state(b.booking)}</p><h2>{b.activity}</h2><p>{localDate(b.startAt,b.timezone)} · {b.groupSize} people</p>{b.cancellationRequests>0&&<p className="field-help">{b.cancellationRequests} cancellation {b.cancellationRequests===1?'request':'requests'}</p>}{b.cleanup==='ACTION_REQUIRED'&&<p className="error">Payment needs studio reconciliation · see Payments to check</p>}</div><span aria-hidden="true">↗</span></Link>{b.cleanup==='ACTION_REQUIRED'&&<Link className="text-button" href="/m/exceptions">Check payment resolution →</Link>}</li>)}</ul>:<p className="muted">Your approved sessions will appear here.</p>}<div className="queue-navigation">{cursor&&<button className="text-button" onClick={()=>setCursor(null)}>Back to newest bookings</button>}{data.nextCursor&&<button className="secondary" onClick={()=>setCursor(data.nextCursor)}>Older bookings →</button>}</div></>}</section>;
}
