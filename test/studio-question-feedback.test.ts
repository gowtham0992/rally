import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import Notice from '../app/components/studio-question-notice.tsx';
import {questionDraftFeedback,questionPrivacyFeedback} from '../app/lib/studio-question-feedback.ts';
import {nextStep,type StepFacts} from '../src/planning/next-step.ts';
test('an expired answer has an explicit visible notice independently of saved-note content',()=>{
 const html=renderToStaticMarkup(createElement(Notice,{expiry:'ANSWER_EXPIRED'}));assert.match(html,/studio answer has expired/);assert.match(html,/role="status"/);assert.match(html,/Review and save your details/);assert.ok(!html.includes('<details'));
 const pending=renderToStaticMarkup(createElement(Notice,{expiry:'QUESTION_EXPIRED'}));assert.match(pending,/studio question has expired/);
});
test('a private session-conflict notice explains only the viewer’s bound answer',()=>{
 const html=renderToStaticMarkup(createElement(Notice,{conflict:true}));assert.match(html,/applies only to one session/);assert.match(html,/needs have not been changed/);assert.ok(!/Friday|Thursday|budget|Riley|Jordan/.test(html));assert.equal(renderToStaticMarkup(createElement(Notice,{conflict:false,expiry:null})), '');
});
test('unavailable, manual review, stale and pending drafts have distinct actionable copy',()=>{
 const unavailable=questionDraftFeedback({status:'REVIEW',reviewReason:'UNAVAILABLE'}),review=questionDraftFeedback({status:'REVIEW',reviewReason:'REVIEW'});
 assert.notEqual(unavailable,review);assert.match(unavailable,/unavailable/);assert.match(unavailable,/note and question are still here/);assert.ok(!unavailable.includes('safely'));assert.match(review,/needs your review/);assert.match(review,/Write the question yourself/);
 assert.match(questionDraftFeedback({status:'STALE'}),/expired or your saved details changed/);assert.match(questionDraftFeedback({status:'DISPATCHED'}),/still in progress/);assert.match(questionDraftFeedback({status:'REVIEW'}),/unavailable/);
});
test('private planning notices cannot replace authoritative issued-offer payment or recovery actions',()=>{
 const facts:StepFacts={state:'OFFER_ISSUED',offerId:'fixture',isOrganizer:false,ownReady:true,noteNeedsReview:true,pickupAnswer:false,pickupAsk:false,pickupWaiting:false,ownChoicesNeedReview:false,memberCount:6,readyCount:6,allowedSizes:[6],studioQuestionConflict:true,studioQuestionExpiry:'ANSWER_EXPIRED'};
 for(const [booking,expected]of [['OPEN','OFFER'],['SETTLING','OFFER'],['CONFIRMED','BOOKED'],['WITHDRAWN','RECOVERY']])assert.equal(nextStep({...facts,bookingState:booking}).kind,expected);
});

test('ambiguous modal rejections identify only a fixed word without echoing arbitrary error data',async()=>{
 const {checkQuestionPrivacy}=await import('../src/intake/studio-questions.ts'),{errorResponse}=await import('../src/web/security.ts'),{IntakeError}=await import('../src/intake/service.ts');
 for(const word of ['Will','May','Can']){let caught:unknown;try{checkQuestionPrivacy(word+': I need access.',[word]);}catch(e){caught=e;}
 const response=errorResponse(caught);assert.equal(response.status,422);assert.deepEqual(await response.json(),{error:'QUESTION_PRIVACY',matchedWord:word.toLowerCase()});assert.match(questionPrivacyFeedback(word.toLowerCase()),new RegExp(word));assert.match(questionPrivacyFeedback(word.toLowerCase()),/keep your essential need/);}
 const error=Object.assign(new IntakeError('QUESTION_PRIVACY'),{matchedWord:'private raw input'});assert.deepEqual(await errorResponse(error).json(),{error:'QUESTION_PRIVACY'});assert.ok(!questionPrivacyFeedback('private raw input').includes('private raw input'));
});
