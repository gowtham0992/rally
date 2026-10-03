import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {crc32} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {verifyPayPalWebhook} from '../src/payments/webhook-signature.ts';
import {handlePayPalWebhook} from '../src/web/paypal-webhook.ts';
import {DomainError,ProviderError} from '../src/payments/types.ts';
import {WebError} from '../src/web/security.ts';

// Disposable local key and certificate, never PayPal evidence or a trusted
// production certificate. TLS/certificate download is isolated by injection.
const directory=mkdtempSync(join(tmpdir(),'rally-webhook-test-'));
const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const keyPath=join(directory,'key.pem'),certPath=join(directory,'certificate.pem');
writeFileSync(keyPath,privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600});
execFileSync('openssl',['req','-new','-x509','-key',keyPath,'-out',certPath,'-subj','/CN=Rally disposable test','-days','2'],{stdio:'pipe'});
const certificate=readFileSync(certPath,'utf8');
after(()=>rmSync(directory,{recursive:true,force:true}));
const webhookId='TRUSTED_TEST_WEBHOOK',certUrl='https://api.sandbox.paypal.com/v1/notifications/certs/CERT-test';
const raw=Buffer.from('{\n  "id": "WH-test", "event_type": "PAYMENT.CAPTURE.COMPLETED",\n  "resource": {"id":"CAP-test", "amount":{"value":"48.00","currency_code":"USD"}}\n}','utf8');
const event=JSON.parse(raw.toString());
function envelope(bytes=raw,id=webhookId,time=new Date().toISOString()){
 const transmission='transmission-test';
 return {'paypal-transmission-id':transmission,'paypal-transmission-time':time,'paypal-auth-algo':'SHA256withRSA','paypal-cert-url':certUrl,
  'paypal-transmission-sig':sign('RSA-SHA256',Buffer.from(`${transmission}|${time}|${id}|${crc32(bytes)}`),privateKey).toString('base64')};
}
function transport(response:()=>Response=()=>new Response(certificate)){
 const calls:{url:string;init?:RequestInit}[]=[];
 const fetcher=(async(input:RequestInfo|URL,init?:RequestInit)=>{calls.push({url:String(input),init});return response();}) as typeof fetch;
 return {fetcher,calls};
}
function request(bytes:BodyInit=raw,headers:Record<string,string>=envelope()){
 return new Request('https://rally.example/api/paypal/webhook',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:bytes});
}
test('webhook RSA verification binds exact bytes, trusted subscription, transmission and signature',async()=>{
 assert.equal(crc32(Buffer.from('123456789')),0xcbf43926); // Independent standard CRC vector.
 const x=transport(),headers=envelope();
 assert.equal(await verifyPayPalWebhook(webhookId,headers,event,raw,x.fetcher),true);
 assert.equal(x.calls[0].url,certUrl);assert.equal(x.calls[0].init?.redirect,'error');
 assert.equal(await verifyPayPalWebhook('OTHER_WEBHOOK',headers,event,raw,x.fetcher),false);
 const reformatted=Buffer.from(JSON.stringify(event));
 assert.equal(await verifyPayPalWebhook(webhookId,headers,event,reformatted,x.fetcher),false);
 const changed=Buffer.from(raw.toString().replace('48.00','49.00'));
 assert.equal(await verifyPayPalWebhook(webhookId,headers,JSON.parse(changed.toString()),changed,x.fetcher),false);
 assert.equal(await verifyPayPalWebhook(webhookId,headers,{...event,id:'different'},raw,x.fetcher),false);
 assert.equal(await verifyPayPalWebhook(webhookId,{...headers,'paypal-transmission-id':'different'},event,raw,x.fetcher),false);
 const badSignature=Buffer.from(headers['paypal-transmission-sig'],'base64');badSignature[0]^=1;
 assert.equal(await verifyPayPalWebhook(webhookId,{...headers,'paypal-transmission-sig':badSignature.toString('base64')},event,raw,x.fetcher),false);
 assert.equal(await verifyPayPalWebhook(webhookId,headers,event,undefined,x.fetcher),false);
 assert.equal(x.calls.length,1); // Certificate cached, signature verified on every delivery.
});
test('webhook verification rejects unsafe certificate URLs and algorithms without outbound requests',async()=>{
 const x=transport();
 for(const url of ['http://api.sandbox.paypal.com/v1/notifications/certs/CERT-test','https://evil.example/v1/notifications/certs/CERT-test',
  'https://api.sandbox.paypal.com.evil.example/v1/notifications/certs/CERT-test','https://user:secret@api.sandbox.paypal.com/v1/notifications/certs/CERT-test',
  certUrl+'?redirect=evil',certUrl+'#part','https://api.sandbox.paypal.com/v2/checkout/orders/test','http://169.254.169.254/latest/meta-data']){
  assert.equal(await verifyPayPalWebhook(webhookId,{...envelope(),'paypal-cert-url':url},event,raw,x.fetcher),false);
 }
 assert.equal(await verifyPayPalWebhook(webhookId,{...envelope(),'paypal-auth-algo':'none'},event,raw,x.fetcher),false);
 assert.equal(await verifyPayPalWebhook(webhookId,{...envelope(),'paypal-transmission-sig':'A'.repeat(129)},event,raw,x.fetcher),false);
 assert.equal(await verifyPayPalWebhook(webhookId,envelope(),event,Buffer.alloc(256001),x.fetcher),false);
 await assert.rejects(verifyPayPalWebhook('',envelope(),event,raw,x.fetcher),{code:'WEBHOOK_NOT_CONFIGURED'});
 assert.equal(x.calls.length,0);
});
test('webhook certificate failures are retryable and downloads have both declared and streamed bounds',async()=>{
 for(const response of [()=>new Response('redirect',{status:302,headers:{Location:'http://169.254.169.254/'}}),
  ()=>new Response(certificate,{headers:{'Content-Length':'16001'}}),()=>new Response('x'.repeat(16001)),()=>new Response('not a certificate')]){
  const x=transport(response);
  await assert.rejects(verifyPayPalWebhook(webhookId,envelope(),event,raw,x.fetcher),{code:'WEBHOOK_CERTIFICATE_UNAVAILABLE'});
 }
 const x=transport(()=>{if(x.calls.length===1)throw new Error('private transport detail');return new Response(certificate);});
 await assert.rejects(verifyPayPalWebhook(webhookId,envelope(),event,raw,x.fetcher),{code:'WEBHOOK_CERTIFICATE_UNAVAILABLE'});
 assert.equal(await verifyPayPalWebhook(webhookId,envelope(),event,raw,x.fetcher),true);
 assert.equal(x.calls.length,2); // A failed certificate fetch cannot poison the cache.
});
test('webhook accepts genuine signed retries but rejects timestamps outside certificate validity',async()=>{
 const x=transport();
 assert.equal(await verifyPayPalWebhook(webhookId,envelope(raw,webhookId,'2000-01-01T00:00:00Z'),event,raw,x.fetcher),false);
 assert.equal(await verifyPayPalWebhook(webhookId,envelope(raw,webhookId,'2099-01-01T00:00:00Z'),event,raw,x.fetcher),false);
 const headers=envelope();
 for(let i=0;i<3;i++)assert.equal(await verifyPayPalWebhook(webhookId,headers,event,raw,x.fetcher),true);
});
test('webhook receiver preserves signed bytes, authenticates every duplicate and needs no browser Origin',async()=>{
 const x=transport();let reservations=0,deliveries=0;
 const deps={reserve:async()=>{reservations++;},webhook:async(headers:Record<string,string>,value:unknown,bytes:Uint8Array)=>{
  assert.deepEqual(bytes,raw);assert.deepEqual(value,event);
  if(!await verifyPayPalWebhook(webhookId,headers,value,bytes,x.fetcher))throw new DomainError('INVALID_WEBHOOK_SIGNATURE',403);
  return {duplicate:deliveries++>0};
 }};
 const headers=envelope(),first=await handlePayPalWebhook(request(raw,headers),deps),duplicate=await handlePayPalWebhook(request(raw,headers),deps);
 assert.equal(first.status,200);assert.equal(first.headers.get('Cache-Control'),'no-store');assert.deepEqual(await first.json(),{duplicate:false});
 assert.equal(duplicate.status,200);assert.deepEqual(await duplicate.json(),{duplicate:true});
 const forged=await handlePayPalWebhook(request(raw,{...headers,'paypal-transmission-id':'forged'}),deps);
 assert.equal(forged.status,403);assert.deepEqual(await forged.json(),{error:'INVALID_WEBHOOK_SIGNATURE'});
 assert.equal(reservations,3);assert.equal(deliveries,2);
});
test('webhook receiver rejects malformed or oversized streamed input before quota and financial work',async()=>{
 let work=0;const deps={reserve:async()=>{work++;},webhook:async()=>{work++;return {duplicate:false};}};
 for(const [value,status] of [['not json',400],['{}',400],['{"id":"event","event_type":"type","resource":{}}',400],['"'+'x'.repeat(256001)+'"',413]] as const){
  assert.equal((await handlePayPalWebhook(request(value),deps)).status,status);
 }
 assert.equal((await handlePayPalWebhook(request(raw,{}),deps)).status,403);
 assert.equal((await handlePayPalWebhook(new Request('https://rally.example',{method:'POST',headers:envelope(),body:raw}),deps)).status,415);
 assert.equal((await handlePayPalWebhook(request(new Uint8Array([0xff,0xfe])),deps)).status,400);
 const chunked=new ReadableStream<Uint8Array>({start(controller){controller.enqueue(new Uint8Array(128001));controller.enqueue(new Uint8Array(128001));controller.close();}});
 const streamed=new Request('https://rally.example',{method:'POST',headers:{...envelope(),'Content-Type':'application/json'},body:chunked,duplex:'half'} as RequestInit);
 assert.equal((await handlePayPalWebhook(streamed,deps)).status,413);
 assert.equal(work,0);
});
test('webhook receiver applies durable quota before crypto and hides internal failures',async()=>{
 let providerCalls=0;
 const quota=await handlePayPalWebhook(request(),{reserve:async()=>{throw new WebError('REQUEST_LIMIT_REACHED',429);},webhook:async()=>{providerCalls++;return {duplicate:false};}});
 assert.equal(quota.status,429);assert.equal(providerCalls,0);
 for(const error of [new Error('private key and raw payload'),new ProviderError('WEBHOOK_CERTIFICATE_UNAVAILABLE')]){
  const response=await handlePayPalWebhook(request(),{reserve:async()=>{},webhook:async()=>{throw error;}});
  assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'TEMPORARILY_UNAVAILABLE'});
 }
});
