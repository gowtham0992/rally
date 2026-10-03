import {test} from 'node:test';
import assert from 'node:assert/strict';
import {groupStatus} from '../app/lib/group-status.ts';
test('closed or unresolved offers cannot advertise an active booking window or confirmed session',()=>{
 for(const booking of ['EXPIRED','WITHDRAWN','SUPERSEDED','ABORTED','CANCELED',null,'UNKNOWN']){
  const status=groupStatus('OFFER_ISSUED','offer',booking);
  assert.notEqual(status.label,'Booking window');assert.notEqual(status.label,'Booked');
  assert.notEqual(status.title,'Your booking is confirmed.');
 }
 assert.equal(groupStatus('OFFER_ISSUED','offer','SETTLING').heading,'Your booking is not confirmed yet.');
 assert.equal(groupStatus('OFFER_ISSUED','offer','OPEN').label,'Booking window');
 assert.equal(groupStatus('OFFER_ISSUED','offer','CONFIRMED').label,'Booked');
});
test('a planning state or missing offer never establishes a booking',()=>{
 const ended=groupStatus('ABANDONED',null,null);assert.equal(ended.label,'Planning ended');assert.match(ended.message!,/no studio offer/);
 for(const state of ['COLLECTING','CLOSED','MERCHANT_REVIEW','OFFER_ISSUED'])assert.notEqual(groupStatus(state,null,'CONFIRMED').label,'Booked');
});
