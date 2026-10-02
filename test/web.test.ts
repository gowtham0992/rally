import {test} from 'node:test';
import assert from 'node:assert/strict';
import {appOrigin,sameOrigin,safeNext,body,errorResponse,WebError} from '../src/web/security.ts';
test('web mutations reject foreign and absent Origin; redirects remain on site',()=>{
 const origin='https://rally.example';
 sameOrigin(new Request(origin,{headers:{Origin:origin,'Sec-Fetch-Site':'same-origin'}}),origin);
 for(const headers of ([{},{Origin:'https://evil.example'},{Origin:origin,'Sec-Fetch-Site':'cross-site'}] as Record<string,string>[]))assert.throws(()=>sameOrigin(new Request(origin,{headers}),origin),/REQUEST_NOT_ALLOWED/);
 for(const value of ['https://evil.example','//evil.example','/\\evil.example','javascript:alert(1)','/\nlocation:evil'])assert.equal(safeNext(value),'/');
 assert.equal(safeNext('/groups/abc?invite=123'),'/groups/abc?invite=123');
 assert.throws(()=>appOrigin('https://rally.example/path'),/SETUP_REQUIRED/);assert.throws(()=>appOrigin('http://rally.example'),/SETUP_REQUIRED/);
});
test('web request body bounds streamed payloads and does not reflect private errors',async()=>{
 const request=(s:string)=>new Request('https://rally.example',{method:'POST',headers:{'Content-Type':'application/json'},body:s});
 assert.deepEqual(await body(request('{"value":1}')),{value:1});
 await assert.rejects(body(request('x')),/INVALID_REQUEST/);
 await assert.rejects(body(request('"'+'x'.repeat(12001)+'"')),/REQUEST_TOO_LARGE/);
 const response=errorResponse(new Error('postgres password and private budget'));assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'TEMPORARILY_UNAVAILABLE'});
 assert.equal(errorResponse(new WebError('SIGN_IN_REQUIRED',401)).status,401);
});
