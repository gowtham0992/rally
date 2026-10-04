import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resourcePollInterval} from '../app/lib/resource-poll.ts';
test('checkout polling is quick only during its bounded preparation window and returns to the normal rate',()=>{
 assert.equal(resourcePollInterval(10000,true,90000,0),3000);
 assert.equal(resourcePollInterval(10000,false,90000,0),10000);
 assert.equal(resourcePollInterval(10000,true,90000,90000),10000);
 assert.equal(resourcePollInterval(10000,true,90000,150000),10000);
 assert.equal(resourcePollInterval(0,false,90000,0),0);
});
