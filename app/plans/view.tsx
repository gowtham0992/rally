'use client';
import {groupStatus} from '../lib/group-status';
import {localDate} from '../lib/format';
import Link from 'next/link';
import {useState} from 'react';
import {apiFetch} from '../lib/api-fetch';
import {useResource} from '../lib/use-resource';
import type {IntakeService,PlanSummary} from '../../src/intake/service';
type List=Awaited<ReturnType<IntakeService['plans']>>&{demo:boolean};
const states:Record<string,string>={COLLECTING:'Getting everyone in',CLOSED:'Choosing a session',MERCHANT_REVIEW:'Studio is checking',OFFER_ISSUED:'Studio offer',ABANDONED:'Planning ended'};
function people(plan:PlanSummary){const others=plan.members.filter(m=>!m.isYou).map(m=>m.displayName);return others.length?`You${others.length===1?' and ':', '}${others.join(', ')}`:'Just you so far';}
export default function Plans({cursor}:{cursor:string|null}){
 const next=`/plans${cursor?`?cursor=${encodeURIComponent(cursor)}`:''}`;
 const {data,loading,error,refresh}=useResource<List>(`/api/groups${cursor?`?cursor=${encodeURIComponent(cursor)}`:''}`,next);
 const [signingOut,setSigningOut]=useState(false),[signOutError,setSignOutError]=useState('');
 async function signOut(){if(signingOut)return;setSigningOut(true);setSignOutError('');try{
  const response=await apiFetch('/api/auth/signout',{method:'POST'});if(!response.ok)throw new Error('We couldn’t sign you out. Try again shortly.');
  // A full navigation drops this document's cached identity and private list.
  location.replace('/');
 }catch(e){setSignOutError(e instanceof TypeError?'Connection interrupted. Try again.':e instanceof Error?e.message:'We couldn’t sign you out. Try again shortly.');setSigningOut(false);}}
 return <main className="plans-layout"><div className="plans-heading"><div><p className="eyebrow">Plans with friends</p><h1 className="page-title">Your plans</h1><p className="muted">Pick up where you left off.</p></div>{data&&!data.demo&&<button className="text-button" disabled={signingOut} onClick={signOut}>{signingOut?'Signing out…':'Sign out'}</button>}</div>{signOutError&&<p className="error" role="alert">{signOutError}</p>}<section aria-label="Your group plans">{loading?<div className="plans-loading" aria-busy="true"><p>Finding your plans…</p><div/><div/></div>:error?<div className="empty-request"><h2>Let’s try that again.</h2><p className="error" role="alert">{error}</p><button className="secondary" onClick={refresh}>Try again</button></div>:data&&<>{data.plans.length?<ul className="plans-list">{data.plans.map(plan=><li key={plan.groupId}><Link href={`/groups/${plan.groupId}`}><div><p className="eyebrow">{plan.studioName}{plan.isOrganizer?' · You’re organizing':''}</p><h2>{plan.activity??'Pottery with friends'}</h2>{plan.startAt&&plan.timezone&&<p className="plan-date">{localDate(plan.startAt,plan.timezone)}</p>}<p className="plan-people">{people(plan)}</p><p className="field-help">{plan.state==='OFFER_ISSUED'?groupStatus(plan.state,plan.offerId,plan.bookingState).label:states[plan.state]??'Open your plan'}{plan.state==='COLLECTING'?` · ${plan.readyCount}/${plan.targetSize} details saved`:''}</p></div><span className="plan-arrow" aria-hidden="true">↗</span></Link></li>)}</ul>:<div className="empty-request"><h2>{cursor?'You’re all caught up.':'Your next plan starts here.'}</h2><p className="muted">{cursor?'There are no older plans on this page.':'Start a group, or open the invite your friends sent you. Your plans will be waiting here when you come back.'}</p></div>}<nav className="queue-navigation" aria-label="Plan pages">{cursor&&<Link className="text-button" href="/plans">Back to newest</Link>}{data.nextCursor&&<Link className="secondary" href={`/plans?cursor=${data.nextCursor}`}>Older plans →</Link>}</nav></>}{error&&cursor&&<Link className="text-button" href="/plans">Back to newest</Link>}</section><Link className="button new-plan-button" href="/groups/new">Start a group <span aria-hidden="true">+</span></Link></main>;
}
