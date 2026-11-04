/** Action selection contains no mutations and never decides whether money moved. */
export type PlanStage=0|1|2|3|4;
export type NextStepKind='REMOVED'|'DETAILS'|'DRAFT'|'PARTICIPATION'|'PICKUP_ANSWER'|'NOTE'|'PICKUP_ASK'|'CHOICES'|'PICKUP_WAIT'|'CLOSE'|'SESSIONS'|'FIND_SESSION'|'REMIND'|'STUDIO_WAIT'|'FRIENDS_WAIT'|'OFFER'|'BOOKED'|'RECOVERY'|'ENDED';
export interface StepFacts {
 state:string;excluded?:boolean;isOrganizer:boolean;ownReady:boolean;noteNeedsReview:boolean;
 pickupAnswer:boolean;pickupRequesterName?:string;pickupAsk:boolean;pickupWaiting:boolean;ownChoicesNeedReview:boolean;
 memberCount:number;readyCount:number;allowedSizes:readonly number[];candidateState?:string|null;
 studioDeclined?:boolean;studioReviewNeedsRefresh?:boolean;offerId?:string|null;bookingState?:string|null;
 noPaymentActivity?:boolean;draftPending?:boolean;participationNeedsConfirmation?:boolean;studioQuestionState?:'WAITING'|'ANSWERED'|null;studioQuestionConflict?:boolean;studioQuestionExpiry?:'ANSWER_EXPIRED'|'QUESTION_EXPIRED'|null;
}
export interface NextStep {kind:NextStepKind;title:string;stage:PlanStage}
export function nextStep(f:StepFacts):NextStep {
 const stage:PlanStage=f.offerId||f.state==='OFFER_ISSUED'?(f.bookingState==='CONFIRMED'?4:3):f.state==='MERCHANT_REVIEW'?2:f.state==='CLOSED'?1:0;
 const step=(kind:NextStepKind,title:string,_stage:PlanStage=stage):NextStep=>({kind,title,stage});
 if(f.excluded)return {kind:'REMOVED',title:'You’re not joining this time',stage:0};
 // Issued and historical offers own financial truth; planning blockers must not mask them.
 if(f.offerId||f.state==='OFFER_ISSUED'){
  if(f.bookingState==='CONFIRMED')return step('BOOKED','Your group is booked',4);
  if(f.bookingState==='OPEN')return step('OFFER','Review your share',3);
  if(f.bookingState==='SETTLING')return step('OFFER','Your payments are being checked',3);
  return step('RECOVERY',f.noPaymentActivity===true?'Offer closed · nothing charged':'Check this booking and your payment',3);
 }
 if(f.state==='ABANDONED')return step('ENDED','This plan has ended');
 if(f.participationNeedsConfirmation)return step('PARTICIPATION','Still coming?');
 if(f.draftPending)return step('DRAFT','Finish your message draft');
 if(!f.ownReady)return step('DETAILS','Add what works for you');
 if(f.pickupAnswer)return step('PICKUP_ANSWER',`${f.pickupRequesterName??'A friend'} asked you to pick up their piece`);
 if(f.studioQuestionExpiry)return step('NOTE',f.studioQuestionExpiry==='ANSWER_EXPIRED'?'Your studio answer has expired':'Your studio question has expired');
 if(f.studioQuestionConflict)return step('NOTE','Review the session your studio answer covers');
 if(f.ownChoicesNeedReview)return step('CHOICES','Review what works for you');
 if(f.noteNeedsReview)return step('NOTE',f.studioQuestionState==='WAITING'?'Waiting for the studio’s reply':f.studioQuestionState==='ANSWERED'?'Read the studio’s answer':'Check what your note means');
 if(f.pickupAsk)return step('PICKUP_ASK','Who could pick up your piece?');
 if(f.pickupWaiting)return step('PICKUP_WAIT','Waiting for your pickup friend');
 if(f.state==='MERCHANT_REVIEW')return step('STUDIO_WAIT','The studio is checking your session',2);
 if(f.state==='COLLECTING'){
  if(f.isOrganizer&&f.allowedSizes.includes(f.memberCount)&&f.readyCount===f.memberCount)return step('CLOSE','Everyone’s in');
  return f.isOrganizer?step('REMIND','Bring your friends together'):step('FRIENDS_WAIT','Waiting for your friends');
 }
 if(f.state==='CLOSED'){
  if(f.readyCount<f.memberCount)return f.isOrganizer?step('REMIND','A friend has a step to finish'):step('FRIENDS_WAIT','Waiting for a friend’s next step');
  if(f.candidateState==='CANDIDATE_READY')return f.isOrganizer?step('SESSIONS','Choose your group’s session',1):step('FRIENDS_WAIT','Your organizer is choosing a session',1);
  if(f.candidateState==='INFEASIBLE')return step('CHOICES','Find another option together',1);
  if(f.candidateState==='NEEDS_CLARIFICATION')return f.isOrganizer?step('REMIND','A friend has a step to finish',1):step('FRIENDS_WAIT','Waiting for a friend’s next step',1);
  return f.isOrganizer?step('FIND_SESSION',f.studioDeclined?'Choose another session':f.studioReviewNeedsRefresh?'Check your group’s updated options':'Find your group’s session',1):step('FRIENDS_WAIT','Your organizer is checking the options',1);
 }
 return step('FRIENDS_WAIT','Waiting for your friends');
}
