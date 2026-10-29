'use client';
import Link from 'next/link';
import Checkout from './checkout';
import Changes from './changes';
import CopyReminder from '../../components/copy-reminder';
import PlanShell,{NextStepCard,People} from '../../components/plan-shell';
import {BookingRules} from '../../components/booking-rules';
import type {PaymentEngine} from '../../../src/payments/engine';
import type {BookingService} from '../../../src/bookings/service';
import {useResource} from '../../lib/use-resource';
import {money,localDate,localTime,displayTerms} from '../../lib/format';
type Issued=Awaited<ReturnType<BookingService['offer']>>&{payment:Awaited<ReturnType<PaymentEngine['participantStatus']>>|null};
const quickUpdates=(data:Issued|null)=>Boolean(data?.payment?.preparingOrder||data?.payment?.payment==='CHECKING_PAYMENT');
export default function Offer({id,returnState}:{id:string;returnState:'returned'|'canceled'|null}){
 const next=`/offers/${id}`,{data,loading,error,sessionExpired,pauseForSignIn,refresh}=useResource<Issued>(`/api/offers/${id}`,next,10000,true,quickUpdates,true);
 const paused=loading||Boolean(error)||sessionExpired,readError=error.includes('switched friends')?'You signed into a different account in another tab. Return to the original account, then check this booking.':error;
 const snapshot=data?.snapshot,candidate=snapshot?.candidate,earlier=data?.isCurrentRound===false;
 const confirmed=data?.booking==='CONFIRMED',open=data?.booking==='OPEN',settling=data?.booking==='SETTLING',live=open||settling||confirmed;
 const canApprove=open&&Boolean(data?.payment?.canAccept||data?.payment?.canAuthorize);
 const title=earlier?'Your earlier booking record':canApprove?`Approve your ${money(candidate!.amountMinor)} hold`:confirmed?'Your group is booked':open?(data?.isMerchant&&!data.isParticipant?'Waiting for the group’s approvals':'Waiting for your friends’ approvals'):settling?'Your payments are being checked':data?.booking==='CANCELED'?'The studio canceled this session':'Check booking and payment recovery';
 const reminder=data&&snapshot&&candidate?<CopyReminder primary={open&&!canApprove} disabled={paused} text={`The studio is holding ${candidate.activity} for us until ${localDate(snapshot.deadline,candidate.timezone)} (${candidate.timezone}). ${data.approvalSteps?.some(m=>m.status==='NEEDS_APPROVAL')?`Still to approve: ${data.approvalSteps.filter(m=>m.status==='NEEDS_APPROVAL').map(m=>m.displayName).join(', ')}. `:''}Approve only your own ${money(candidate.amountMinor)} share. Rally starts charging after everyone’s payment approval is checked in time. Our booking confirms after every payment completes.`} path={next}/>:null;
 return <PlanShell backHref={data?.isMerchant&&!data.isParticipant?'/studio':'/plans'} backLabel={data?.isMerchant&&!data.isParticipant?'Studio requests':'Your plans'} studioName={candidate?.studioName??'Willow Studio'} when={candidate?localDate(candidate.startAt,candidate.timezone):null} stage={confirmed?4:3} ended={Boolean(data&&!live)}>
  {sessionExpired&&<section className="notice" aria-label="Booking sign-in paused"><h2>Keep your booking open.</h2><p role="status">Your confirmations are still here. Sign in in another tab, then check this booking before continuing.</p><a className="secondary" target="_blank" rel="noopener" href={`/login?next=${encodeURIComponent(next)}`}>Sign in again in another tab ↗</a><button className="text-button" disabled={loading} onClick={refresh}>Check my sign-in, keep my choices</button></section>}
  {error&&data&&!sessionExpired&&<p className="field-help">These are the last loaded details. Payment and booking actions are paused until this booking can be checked.</p>}
  {loading&&!data?<section className="next-step-card skeleton" aria-busy="true"><p>Opening your booking…</p><div/><div/></section>:data&&candidate&&snapshot?<>
   <NextStepCard title={title}>
    {earlier&&<p className="field-help">Your group has moved on. These terms and payment records belong to this earlier booking. <Link href={`/groups/${snapshot.groupId}`}>Open the current plan →</Link></p>}
    {confirmed&&Boolean(data.ownPickupNames?.length)&&<p className="pickup-duty">You’re picking up {data.ownPickupNames.join(' and ')}’s piece{data.ownPickupNames.length>1?'s':''} after firing.</p>}
    <div className="booking-facts"><h3>{candidate.activity}</h3><p>{localDate(candidate.startAt,candidate.timezone)} to {localTime(candidate.endAt,candidate.timezone)} · {candidate.timezone}</p><p className="plan-price">{money(candidate.amountMinor)} <small>per person</small></p>
     {open&&<p>Approve by {localDate(snapshot.deadline,candidate.timezone)} ({candidate.timezone}).</p>}
     {(canApprove||data.isMerchant)&&<><p className="field-help">Pickup: {candidate.collectionDescription}</p><p className="field-help">Cancellation: {displayTerms(candidate.cancellationTerms)}</p><p className="field-help">Personal cancellations aren’t automatically refunded. <a href="#booking-terms">Full terms & timing ↓</a></p>{snapshot.collectionArrangements.map(a=><p className="field-help" key={a.ownerMemberId}>{a.nomineeName} {live?'will pick up':'agreed to pick up'} for {a.ownerName}. {live?'Both have agreed.':'This arrangement belongs to this booking.'}</p>)}</>}
    </div>
    {data.payment&&<Checkout key={data.offerHash} offerId={id} offerHash={data.offerHash} status={data.payment} disabled={paused} returnState={returnState} pauseForSignIn={pauseForSignIn} refresh={refresh}/>}
    {!data.payment&&<p>{confirmed?'Every required payment completed. The group is booked.':open?'Each friend needs to approve their own hold before the deadline. The booking confirms only after every payment completes.':settling?'The separate payments are being checked. A pending payment does not confirm the booking.':'Payment recovery must finish before the group can start again.'}</p>}
    {(open||settling)&&<p className="payment-count" role="status">{data.paymentApprovalProgress.verified} of {data.paymentApprovalProgress.total} have approved{settling?' · Booking confirms after all payments complete.':'.'}</p>}
    {open&&data.isOrganizer&&<div className="organizer-reminder">{reminder}<p className="field-help">Your reminder includes names only for friends who need to approve. Approvals being checked should not be restarted.</p></div>}
    {!live&&<Changes key={`recovery:${data.offerHash}`} id={id} offer={data} disabled={paused} pauseForSignIn={pauseForSignIn} refresh={refresh}/>}
   </NextStepCard>
   <People members={snapshot.roster.map(m=>({id:m.memberId,name:m.displayName,status:data.approvalSteps?({VERIFIED:'Approved',CHECKING:'Checking with PayPal',NEEDS_APPROVAL:'Needs approval'})[data.approvalSteps.find(s=>s.memberId===m.memberId)?.status??'NEEDS_APPROVAL']:confirmed?'Booked':undefined}))}/>
   <details className="plan-disclosure" id="booking-terms"><summary>Booking details, terms & timing</summary><dl className="session-details"><div><dt>Pickup</dt><dd>{candidate.collectionDescription}</dd></div><div><dt>Cancellation terms</dt><dd>{displayTerms(candidate.cancellationTerms)}</dd></div></dl><BookingRules/><p className="field-help">These terms belong to this exact booking. Rally doesn’t add a guaranteed personal refund window or cutoff.</p>{snapshot.collectionArrangements.map(a=><p className="field-help" key={a.ownerMemberId}>{a.nomineeName} agreed to pick up for {a.ownerName}.</p>)}{live&&<Changes key={`changes:${data.offerHash}`} id={id} offer={data} disabled={paused} pauseForSignIn={pauseForSignIn} refresh={refresh}/>}</details>
   <section className="plan-record-links"><Link className="text-button" href={data.isParticipant?`/groups/${snapshot.groupId}`:'/studio'}>{data.isParticipant?'See your saved plan details':'Back to studio requests'} →</Link><button className="text-button" disabled={loading} onClick={refresh}>{loading?'Checking…':'Refresh this booking'}</button></section>
   {data.isMerchant&&data.paymentRecords.length>0&&<details className="plan-disclosure"><summary>Studio payment records</summary><ul className="studio-payment-records">{data.paymentRecords.map(record=><li key={record.operationId}><Link className="text-button" href={`/m/payments/${record.operationId}`}>{record.memberName} · {({CREATE_ORDER:'Checkout',AUTHORIZE:'Authorization',CAPTURE:'Payment',VOID:'Authorization release',REFUND:'Refund'} as Record<string,string>)[record.kind]} ↗</Link></li>)}</ul></details>}
  </>:null}
  {error&&!sessionExpired&&<div className="notice"><p className="error" role="alert">{readError}</p><button className="secondary" onClick={refresh}>Try again</button></div>}
 </PlanShell>;
}
