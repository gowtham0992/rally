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
function nextStep(plan:PlanSummary){
 if(plan.ownNoteNeedsReview)return 'Review your private note';
 if(plan.state==='COLLECTING')return !plan.ownReady?'Save your details':plan.readyCount>=plan.targetSize?(plan.isOrganizer?'Confirm who’s coming':'Waiting for your organizer to confirm the group'):'Waiting for friends to save their details';
 if(['CLOSED','MERCHANT_REVIEW'].includes(plan.state)&&plan.collectionNextStep)return ({ASK_COLLECTOR:'Ask your friend to collect',REVIEW_REQUEST:'Review a friend’s collection request',CHOOSE_COLLECTOR:'Update your collection choice'})[plan.collectionNextStep];
 if(plan.noSharedSession)return plan.isOrganizer?'No session fits yet — check in with friends':'No session fits yet — review choices with your group';
 if(plan.studioDeclined)return 'Studio declined — review your options';
 if(plan.studioReviewNeedsRefresh)return plan.isOrganizer?'Check options and ask the studio again':'Waiting for your organizer to send a fresh request';
 if(plan.state==='CLOSED')return plan.isOrganizer?'Check the group’s options':'Open the group’s plan';
 if(plan.state==='MERCHANT_REVIEW')return 'Waiting for the studio’s answer';
 if(plan.state==='OFFER_ISSUED'&&plan.offerId){
  if(plan.bookingState==='CONFIRMED')return 'See your booking';
  if(plan.bookingState==='OPEN')return 'Review the offer and check your share';
  if(plan.bookingState==='SETTLING')return 'Check your payment';
  if(['EXPIRED','WITHDRAWN','SUPERSEDED','ABORTED','CANCELED'].includes(plan.bookingState??'')){
   if(plan.bookingCleanup==='ACTION_REQUIRED')return 'An unresolved payment needs studio review — open the offer';
   if(plan.bookingCleanup==='COMPLETE')return plan.isOrganizer?'Payment recovery complete — start another round':'Payment recovery complete — see your payment record';
   if(['REQUIRED','RUNNING'].includes(plan.bookingCleanup??''))return 'Payment recovery is being checked — open the offer';
  }
  return 'Check this offer’s payment status';
 }
 return 'Open your plan';
}
export default function Plans({cursor}:{cursor:string|null}){
 const next=`/plans${cursor?`?cursor=${encodeURIComponent(cursor)}`:''}`;
 const {data,loading,error,refresh}=useResource<List>(`/api/groups${cursor?`?cursor=${encodeURIComponent(cursor)}`:''}`,next,10000,true);
 const [signingOut,setSigningOut]=useState(false),[signOutError,setSignOutError]=useState('');
 async function signOut(){if(signingOut)return;setSigningOut(true);setSignOutError('');try{
  const response=await apiFetch('/api/auth/signout',{method:'POST'});if(!response.ok)throw new Error('We couldn’t sign you out. Try again shortly.');
  // A full navigation drops this document's cached identity and private list.
  location.replace('/');
 }catch(e){setSignOutError(e instanceof TypeError?'Connection interrupted. Try again.':e instanceof Error?e.message:'We couldn’t sign you out. Try again shortly.');setSigningOut(false);}}
 return <main className="plans-layout"><div className="plans-heading"><div><p className="eyebrow">Plans with friends</p><h1 className="page-title">Your plans</h1><p className="muted">Pick up where you left off.</p></div><div className="plans-controls"><button className="text-button" disabled={loading} onClick={refresh}>{loading&&data?'Refreshing…':'Refresh plans'}</button>{data&&!data.demo&&<button className="text-button" disabled={signingOut} onClick={signOut}>{signingOut?'Signing out…':'Sign out'}</button>}</div></div>{signOutError&&<p className="error" role="alert">{signOutError}</p>}<section aria-label="Your group plans" aria-busy={loading}>{loading&&!data?<div className="plans-loading" aria-busy="true"><p>Finding your plans…</p><div/><div/></div>:error?<div className="empty-request"><h2>Let’s try that again.</h2><p className="error" role="alert">{error}</p><button className="secondary" onClick={refresh}>Try again</button></div>:data&&<>{data.plans.length?<ul className="plans-list">{data.plans.map(plan=><li key={plan.groupId}><Link href={plan.state==='OFFER_ISSUED'&&plan.offerId?`/offers/${plan.offerId}`:`/groups/${plan.groupId}`}><div><p className="eyebrow">{plan.studioName}{plan.isOrganizer?' · You’re organizing':''}</p><h2>{plan.activity??'Pottery with friends'}</h2>{plan.startAt&&plan.timezone&&<p className="plan-date">{localDate(plan.startAt,plan.timezone)}</p>}<p className="plan-people">{people(plan)}</p><p className="plan-next">{nextStep(plan)}</p><p className="field-help">{plan.state==='OFFER_ISSUED'?groupStatus(plan.state,plan.offerId,plan.bookingState).label:plan.noSharedSession?'Choosing another plan':plan.studioDeclined?'Studio declined':plan.studioReviewNeedsRefresh?'Request needs updating':states[plan.state]??'Open your plan'}{plan.state==='COLLECTING'?` · ${plan.readyCount}/${plan.targetSize} details saved`:''}</p>{plan.bookingState==='OPEN'&&plan.deadline&&plan.timezone&&<p className="field-help">Approval window ends {localDate(plan.deadline,plan.timezone)} ({plan.timezone}).</p>}</div><span className="plan-arrow" aria-hidden="true">→</span></Link></li>)}</ul>:<div className="empty-request"><h2>{cursor?'You’re all caught up.':'Your next plan starts here.'}</h2><p className="muted">{cursor?'There are no older plans on this page.':'Start a group, or open the invite your friends sent you. Your plans will be waiting here when you come back.'}</p></div>}<nav className="queue-navigation" aria-label="Plan pages">{cursor&&<Link className="text-button" href="/plans">Back to newest</Link>}{data.nextCursor&&<Link className="secondary" href={`/plans?cursor=${data.nextCursor}`}>Older plans →</Link>}</nav></>}{error&&cursor&&<Link className="text-button" href="/plans">Back to newest</Link>}</section><Link className="button new-plan-button" href="/groups/new">Start a group <span aria-hidden="true">+</span></Link></main>;
}
