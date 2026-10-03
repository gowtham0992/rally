'use client';
import Link from 'next/link';
import StudioBookings from './bookings';
import {useState} from 'react';
import type {BookingService} from '../../src/bookings/service';
import {useResource} from '../lib/use-resource';
import {localDate,money} from '../lib/format';
type Queue=Awaited<ReturnType<BookingService['merchantQueue']>>;
export default function Studio(){
 const [cursor,setCursor]=useState<string|null>(null),{data,loading,error,refresh}=useResource<Queue>(`/api/studio/requests${cursor?`?cursor=${cursor}`:''}`,'/studio');
 return <main className="studio-layout"><section className="studio-heading"><p className="eyebrow">At the studio</p><h1 className="page-title">Your next<br/><em>group session.</em></h1><p className="muted">Review a group’s plan, reserve the time, and let each person pay their share.</p><p className="field-help">Only sessions assigned to your studio appear here.</p></section><section className="card" aria-label="Studio requests"><div className="card-top"><p className="eyebrow">Waiting for your review</p><button className="text-button" onClick={refresh} disabled={loading}>Refresh</button></div>{loading?<p aria-busy="true">Checking your requests…</p>:error?<><p className="error" role="alert">{error}</p><button className="secondary" onClick={refresh}>Try again</button></>:data&&<>{data.requests.length?<ul className="studio-request-list">{data.requests.map(r=><li key={r.requestId}><Link href={`/studio/requests/${r.requestId}`}><div><p className="eyebrow">{r.groupSize} people · {r.studioName}</p><h2>{r.activity}</h2><p>{localDate(r.startAt,r.timezone)}</p><p className="field-help">{r.timezone} · {money(r.amountMinor)} per person</p></div><span aria-hidden="true">↗</span></Link></li>)}</ul>:<div className="empty-request"><h2>A little room in the calendar.</h2><p className="muted">No group is waiting for approval right now. New requests will appear once a group finds a plan that works for everyone.</p></div>}<div className="queue-navigation">{cursor&&<button className="text-button" onClick={()=>setCursor(null)}>Back to newest</button>}{data.nextCursor&&<button className="secondary" onClick={()=>setCursor(data.nextCursor)}>Older requests →</button>}</div></>}<StudioBookings/></section></main>;
}
