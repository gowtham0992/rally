// Offline app configuration, never a payment. Scope is this sandbox application
// and the fixed deployed receiver. Preserve all unrelated webhook subscriptions.
import {writeFile,readFile,chmod} from 'node:fs/promises';
import {z} from 'zod';
const origin='https://rally.gowthamsarveswaran.com',receiver=origin+'/api/paypal/webhook';
const api='https://api-m.sandbox.paypal.com';
const events=['PAYMENT.AUTHORIZATION.CREATED','PAYMENT.AUTHORIZATION.VOIDED','PAYMENT.CAPTURE.COMPLETED','PAYMENT.CAPTURE.PENDING',
 'PAYMENT.CAPTURE.DECLINED','PAYMENT.CAPTURE.REFUNDED','PAYMENT.REFUND.PENDING','PAYMENT.REFUND.FAILED'];
const subscription=z.object({id:z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),url:z.string(),event_types:z.array(z.object({name:z.string()}))});
async function run(){
 if(process.env.ENABLE_SANDBOX_WEBHOOK_CONFIG!=='true')throw new Error('EXPLICIT_SANDBOX_WEBHOOK_SETUP_REQUIRED');
 const {PAYPAL_CLIENT_ID:clientId,PAYPAL_CLIENT_SECRET:clientSecret}=process.env;
 if(!clientId||!clientSecret)throw new Error('PAYPAL_SANDBOX_CREDENTIALS_REQUIRED');
 const health=await fetch(origin+'/api/health',{redirect:'error',signal:AbortSignal.timeout(60000)});
 if(!health.ok||(await health.json()).ready!==true)throw new Error('VERIFIED_DEPLOYMENT_REQUIRED');
 const unsigned=await fetch(receiver,{method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),headers:{'Content-Type':'application/json'},body:'{}'});
 if(unsigned.status!==403||(await unsigned.json()).error!=='INVALID_WEBHOOK_SIGNATURE')throw new Error('DEPLOYED_SIGNATURE_GUARD_REQUIRED');
 const auth=await fetch(api+'/v1/oauth2/token',{method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),
  headers:{Authorization:'Basic '+Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials'});
 if(!auth.ok)throw new Error(`WEBHOOK_OAUTH_HTTP_${auth.status}`);
 const token=z.object({access_token:z.string().min(1)}).parse(await auth.json()).access_token;
 async function request(path:string,value?:unknown){
  const r=await fetch(api+path,{method:value?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(30000),headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:value?JSON.stringify(value):undefined});
  if(!r.ok)throw new Error(`WEBHOOK_CONFIG_HTTP_${r.status}`);
  return r.json();
 }
 const supported=z.object({event_types:z.array(z.object({name:z.string()}))}).parse(await request('/v1/notifications/webhooks-event-types'));
 if(events.some(name=>!supported.event_types.some(e=>e.name===name)))throw new Error('WEBHOOK_EVENT_NOT_AVAILABLE');
 async function locate(){
  const all=z.object({webhooks:z.array(subscription).max(100)}).parse(await request('/v1/notifications/webhooks'));
  const exact=all.webhooks.filter(w=>w.url===receiver);if(exact.length>1)throw new Error('DUPLICATE_RECEIVER_REVIEW_REQUIRED');
  return {match:exact[0],unrelated:all.webhooks.length-exact.length};
 }
 const before=await locate();let selected=before.match,created=false;
 if(!selected){
  try{selected=subscription.parse(await request('/v1/notifications/webhooks',{url:receiver,event_types:events.map(name=>({name}))}));created=true;}
  catch{selected=(await locate()).match;if(!selected)throw new Error('WEBHOOK_CREATE_OUTCOME_UNRESOLVED');}
 }
 const audit=subscription.parse(await request('/v1/notifications/webhooks/'+encodeURIComponent(selected.id)));
 if(audit.id!==selected.id||audit.url!==receiver||events.some(name=>!audit.event_types.some(e=>e.name===name)))throw new Error('WEBHOOK_SUBSCRIPTION_AUDIT_FAILED');
 const envPath=new URL('../.env.webhook',import.meta.url),contents=`PAYPAL_WEBHOOK_ID=${audit.id}\n`;
 try{await writeFile(envPath,contents,{flag:'wx',mode:0o600});}
 catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;if(await readFile(envPath,'utf8')!==contents)throw new Error('EXISTING_WEBHOOK_CONFIG_MISMATCH');await chmod(envPath,0o600);}
 const report={scope:'actual_paypal_sandbox_subscription_configuration',checkedAt:new Date().toISOString(),receiver,created,subscriptionVerified:true,
  subscribedEvents:events,unrelatedSubscriptionsPreserved:before.unrelated,privateConfigurationFile:'.env.webhook',signedSandboxDeliveryVerified:false,
  simulatorUsed:false,paymentsCreated:0,livePaymentEndpointsUsed:0};
 await writeFile(new URL('../evidence/paypal-webhook-configuration.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report));
}
try{await run();}catch(e){const code=e instanceof Error?e.message:'';console.error(/^[A-Z][A-Z_0-9]+$/.test(code)?code:'SANDBOX_WEBHOOK_SETUP_FAILED');process.exitCode=1;}
