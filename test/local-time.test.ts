import {test} from 'node:test';
import assert from 'node:assert/strict';
import {localFields,resolveLocalTime} from '../src/planning/local-time.ts';

test('leave-by wall time resolves in the studio timezone, including midnight and fractional offsets',()=>{
 assert.deepEqual(resolveLocalTime('2026-11-19','19:00','America/Denver'),{status:'VALID',instant:'2026-11-20T02:00:00.000Z'});
 assert.deepEqual(localFields('2026-11-20T02:00:00.000Z','America/Denver'),{date:'2026-11-19',time:'19:00'});
 assert.deepEqual(resolveLocalTime('2026-11-19','00:00','America/Denver'),{status:'VALID',instant:'2026-11-19T07:00:00.000Z'});
 assert.deepEqual(resolveLocalTime('2026-11-19','19:00','Asia/Kathmandu'),{status:'VALID',instant:'2026-11-19T13:15:00.000Z'});
 assert.deepEqual(resolveLocalTime('0099-11-19','19:00','UTC'),{status:'VALID',instant:'0099-11-19T19:00:00.000Z'});
});
test('leave-by rejects skipped clock times instead of moving the requirement',()=>{
 assert.deepEqual(resolveLocalTime('2026-03-08','02:30','America/Denver'),{status:'NONEXISTENT'});
 assert.deepEqual(resolveLocalTime('2026-10-04','02:15','Australia/Lord_Howe'),{status:'NONEXISTENT'});
 assert.deepEqual(resolveLocalTime('2011-12-30','12:00','Pacific/Apia'),{status:'NONEXISTENT'});
});
test('leave-by rejects repeated clock times instead of silently choosing an offset',()=>{
 assert.deepEqual(resolveLocalTime('2026-11-01','01:30','America/Denver'),{status:'AMBIGUOUS'});
 assert.deepEqual(resolveLocalTime('2026-04-05','01:45','Australia/Lord_Howe'),{status:'AMBIGUOUS'});
});
test('leave-by rejects malformed wall times, invalid calendar dates and unknown timezones',()=>{
 for(const [date,time,zone] of [['2026-02-30','19:00','UTC'],['2026-02-29','19:00','UTC'],['2026-11-19','24:00','UTC'],['2026-11-19','7:00','UTC'],['2026-11-19','','UTC'],['2026-11-19','19:00','Invented/Zone']])assert.deepEqual(resolveLocalTime(date,time,zone),{status:'INVALID'});
});
