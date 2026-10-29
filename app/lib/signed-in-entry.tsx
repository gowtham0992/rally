'use client';
import Link from 'next/link';
import {useResource} from './use-resource';
import {useInvitation} from './use-invitation';
import StudioOptions from '../components/studio-options';
import {catalogSchema} from '../../src/planning/domain';
import {money} from './format';
import fixture from '../../fixtures/studio.json';
const catalog=catalogSchema.parse(fixture),prices=catalog.offerings.filter(o=>o.verified).map(o=>o.priceMinor);
export default function SignedInEntry({next,children}:{next:string;children:React.ReactNode|((invitation:{organizerName:string;studioName:string}|null)=>React.ReactNode)}){
 const {data,loading,error,refresh}=useResource<{signedIn:boolean}>('/api/auth/session',next);
 const invitation=useInvitation(next),joining=next.startsWith('/join?');
 if(loading||error||!data?.signedIn)return <main className="invitation-entry"><section className="invitation-first" aria-label="Continue to your plan">
  <h1>{joining?(invitation.data?`${invitation.data.organizerName} invited you to pottery`:'Pottery with your friends'):'Make a plan with your people.'}</h1>
  <p className="muted">{invitation.data?.studioName??catalog.studioName} · {money(Math.min(...prices))}–{money(Math.max(...prices))} per person</p>
  <p>You set your own private spending limit. Everyone approves their own share.</p>
  {invitation.unavailable?<><p role="status">This invitation isn’t available. Ask your friend to check the link.</p><Link className="text-button" href="/plans">Your plans →</Link></>:loading||invitation.loading?<p className="field-help" aria-busy="true">Opening your invitation…</p>:error?<><p className="error" role="alert">{error}</p><button className="secondary full" onClick={refresh}>Try again</button></>:<Link className="button full" href={`/login?next=${encodeURIComponent(next)}`}>{joining?(invitation.data?`Join ${invitation.data.organizerName}’s plan`:'Join your friends’ plan'):'Start our plan'} →</Link>}
  <p className="field-help">You’ll review the exact session and terms before approving a payment.</p>
 </section><details className="plan-disclosure"><summary>What’s on offer?</summary><StudioOptions catalog={catalog}/></details></main>;
 return typeof children==='function'?children(invitation.data):children;
}
