import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PayPalSandbox } from '../src/payments/paypal.ts';
import { fingerprint, type Operation } from '../src/payments/types.ts';

function operation(kind:Operation['kind']):Operation {
  const payload = {merchantId:'MERCHANT',amountMinor:4800,currency:'USD' as const,offerId:randomUUID(),memberId:randomUUID(),referenceId:randomUUID(),parentId:'PARENT'};
  return {id:randomUUID(),offer_id:payload.offerId,member_id:payload.memberId,kind,state:'PLANNED',request_id:randomUUID(),payload,payload_hash:fingerprint(payload),provider_id:null,provider_status:null,approval_url:null,dispatched_at:null,retry_until:null,lease_token:null,lease_until:null};
}
function orderResponse(op:Operation) {
  return {id:'ORDER',intent:'AUTHORIZE',status:'APPROVED',payer:{payer_id:'BUYER'},purchase_units:[{
    reference_id:op.payload.referenceId,custom_id:op.payload.offerId,amount:{value:'48.00',currency_code:'USD'},payee:{merchant_id:'MERCHANT'},
    payments:{authorizations:[{id:'AUTH',status:'CREATED',amount:{value:'48.00',currency_code:'USD'},expiration_time:'2099-01-01T00:00:00Z'}]}
  }],links:[{rel:'approve',href:'https://www.sandbox.paypal.com/checkoutnow?token=ORDER'}]};
}
function adapter(fn:(url:string,init?:RequestInit)=>unknown) {
  const calls:{url:string;init?:RequestInit}[]=[];
  const transport = (async (input:RequestInfo|URL,init?:RequestInit) => {
    const url = String(input);calls.push({url,init});
    const body = url.endsWith('/oauth2/token') ? {access_token:'NOT_A_REAL_TOKEN',expires_in:3600} : fn(url,init);
    return new Response(JSON.stringify(body),{status:200,headers:{'Content-Type':'application/json'}});
  }) as typeof fetch;
  return {provider:new PayPalSandbox({clientId:'fixture',clientSecret:'fixture',merchantId:'MERCHANT'},transport),calls};
}
test('sandbox adapter sends one AUTHORIZE purchase unit with fixed merchant and request ID',async () => {
  const op=operation('CREATE_ORDER'),x=adapter(()=>orderResponse(op));await x.provider.execute(op);
  const call=x.calls.find(c=>c.url.endsWith('/v2/checkout/orders'))!,body=JSON.parse(call.init!.body as string);
  assert.equal(body.intent,'AUTHORIZE');assert.equal(body.purchase_units.length,1);
  assert.equal(body.purchase_units[0].amount.value,'48.00');assert.equal(body.purchase_units[0].payee.merchant_id,'MERCHANT');
  assert.equal((call.init!.headers as Record<string,string>)['PayPal-Request-Id'],op.request_id);
  assert.ok(x.calls.every(c=>c.url.startsWith('https://api-m.sandbox.paypal.com/')));
});
test('sandbox adapter rejects changed provider amount or merchant before qualification',async () => {
  const op=operation('AUTHORIZE');
  const wrongAmount=orderResponse(op);wrongAmount.purchase_units[0].amount.value='49.00';
  await assert.rejects(adapter(()=>wrongAmount).provider.execute(op),{code:'PROVIDER_AMOUNT_MISMATCH'});
  const wrongPayee=orderResponse(op);wrongPayee.purchase_units[0].payee.merchant_id='OTHER';
  await assert.rejects(adapter(()=>wrongPayee).provider.execute(op),{code:'PROVIDER_BINDING_MISMATCH'});
});
test('lost capture reconciliation selects only the operation invoice from its own order',async () => {
  const op=operation('CAPTURE'),order=orderResponse(op);
  Object.assign(order.purchase_units[0].payments,{captures:[
    {id:'OTHER_CAPTURE',status:'COMPLETED',amount:{value:'48.00',currency_code:'USD'},invoice_id:randomUUID()},
    {id:'RIGHT_CAPTURE',status:'COMPLETED',amount:{value:'48.00',currency_code:'USD'},invoice_id:op.id}
  ]});
  const x=adapter(url=>url.includes('/authorizations/') ? {id:'PARENT',status:'CAPTURED',amount:{value:'48.00',currency_code:'USD'},links:[{rel:'up',href:'https://api-m.sandbox.paypal.com/v2/checkout/orders/ORDER'}]} : order);
  assert.equal((await x.provider.observe(op))?.id,'RIGHT_CAPTURE');
  assert.ok(x.calls.every(c=>c.init?.method==='GET'||c.url.endsWith('/oauth2/token')));
});
test('provider links cannot cause outbound requests outside the sandbox allowlist',async () => {
  const op=operation('CAPTURE'),x=adapter(()=>({id:'PARENT',status:'CAPTURED',amount:{value:'48.00',currency_code:'USD'},links:[{rel:'up',href:'http://169.254.169.254/latest/meta-data'}]}));
  await assert.rejects(x.provider.observe(op),{code:'INVALID_PROVIDER_LINK'});
  assert.equal(x.calls.length,2);
});
test('pending refunds remain pending and missing retention disables mutation replay',async () => {
  const op=operation('REFUND'),x=adapter(()=>({id:'REFUND',status:'PENDING',invoice_id:op.id,amount:{value:'48.00',currency_code:'USD'}}));
  assert.equal((await x.provider.execute(op)).outcome,'pending');assert.equal(x.provider.retentionMs('REFUND'),null);
});
test('same-amount refund from a different capture cannot satisfy cleanup',async () => {
  const op=operation('REFUND');op.provider_id='REFUND';
  const x=adapter(()=>({id:'REFUND',status:'COMPLETED',amount:{value:'48.00',currency_code:'USD'},links:[{rel:'up',href:'https://api-m.sandbox.paypal.com/v2/payments/captures/DIFFERENT'}]}));
  await assert.rejects(x.provider.observe(op),{code:'PROVIDER_PARENT_MISMATCH'});
});
