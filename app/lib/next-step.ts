import {nextStep} from '../../src/planning/next-step';
import {privateFeedback} from './private-feedback';
import {publishedGroupSizes} from '../../src/planning/capacity';
import type {IntakeService} from '../../src/intake/service';
type Context=Awaited<ReturnType<IntakeService['participantContext']>>;
export function contextNextStep(c:Context){
 const owner=c.collectionRequests.find(r=>r.role==='OWNER'),p=c.preference;
 const ask=p?.collection==='NOMINEE_LATER'&&(!owner||owner.revoked||!owner.ownerAgreed);
 return nextStep({state:c.state,excluded:c.excluded,isOrganizer:c.isOrganizer,ownReady:Boolean(p),
  noteNeedsReview:Boolean(c.optionalText&&p?.extraRequirement==='MERCHANT_REVIEW_REQUIRED'),
  pickupRequesterName:c.collectionRequests.find(r=>r.role==='NOMINEE'&&!r.revoked&&!r.nomineeAgreed)?.ownerName,
  pickupAnswer:c.collectionRequests.some(r=>r.role==='NOMINEE'&&!r.revoked&&!r.nomineeAgreed),pickupAsk:Boolean(ask),
  pickupWaiting:Boolean(owner&&!owner.revoked&&owner.ownerAgreed&&!owner.nomineeAgreed),
  ownChoicesNeedReview:Boolean(p&&privateFeedback(c.catalog,{...p,extraRequirement:'NONE'},c.targetSize,false)),
  draftPending:c.hasUnfinishedDraft,participationNeedsConfirmation:Boolean(c.withdrawal?.isYou&&c.withdrawal.coming!==true),
  memberCount:c.members.filter(m=>!m.excluded).length,readyCount:c.members.filter(m=>!m.excluded&&m.stepStatus==='READY').length,
  allowedSizes:publishedGroupSizes(c.catalog),candidateState:c.candidate?.state,studioDeclined:Boolean(c.studioDecline),studioReviewNeedsRefresh:c.studioReviewNeedsRefresh,
  offerId:c.offerId,bookingState:c.bookingState});
}
