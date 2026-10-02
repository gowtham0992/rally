import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {database,localDatabaseUrl} from '../src/db.ts';
import {parseMinor} from '../src/payments/types.ts';
const scenario=z.enum(['success','partial-failure','lost-response']).parse(process.argv[2]);
const session={id:z.uuid().parse(process.argv[3]??JSON.parse(await readFile(new URL('../evidence/private/sandbox-session.json',import.meta.url),'utf8')).id)};
const pool=database(process.env.DATABASE_URL??localDatabaseUrl),base='https://api-m.sandbox.paypal.com';
function requireFact(value:unknown,message:string):asserts value{if(!value)throw new Error(message);}
const id=z.string().regex(/^[A-Za-z0-9_-]+$/),amount=z.object({currency_code:z.literal('USD'),value:z.string()});
const resource=z.object({id,status:z.string(),amount});
const order=z.object({id,status:z.string(),intent:z.literal('AUTHORIZE'),payer:z.object({payer_id:id}).optional(),payment_source:z.object({paypal:z.object({account_id:id})}).optional(),
 purchase_units:z.array(z.object({reference_id:z.string(),custom_id:z.string(),payee:z.object({merchant_id:id}),amount,
 payments:z.object({authorizations:z.array(z.object({id})).optional(),captures:z.array(z.object({id})).optional()}).optional()})).length(1)});
try{
 const clientId=process.env.PAYPAL_CLIENT_ID,secret=process.env.PAYPAL_CLIENT_SECRET,merchant=process.env.PAYPAL_MERCHANT_ID,buyers=process.env.PAYPAL_BUYER_IDS?.split(',');
 requireFact(clientId&&secret&&merchant&&buyers?.length===3,'Sandbox configuration missing');
 const tokenResponse=await fetch(base+'/v1/oauth2/token',{method:'POST',redirect:'error',headers:{Authorization:'Basic '+Buffer.from(clientId+':'+secret).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials',signal:AbortSignal.timeout(15000)});
 requireFact(tokenResponse.ok,'Sandbox OAuth failed');const token=z.object({access_token:z.string()}).parse(await tokenResponse.json()).access_token;
 async function get(path:string){const response=await fetch(base+path,{redirect:'error',headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});requireFact(response.ok,'Sandbox resource read failed: '+response.status);return response.json();}
 const offer=(await pool.query('SELECT id,state,cleanup,amount_minor,currency,offer_hash,deadline,reservation_end FROM offers WHERE id=$1',[session.id])).rows[0];
 const members=(await pool.query('SELECT id,ordinal,order_id,authorization_id,payer_id FROM offer_members WHERE offer_id=$1 ORDER BY ordinal',[session.id])).rows;
 const ops=(await pool.query('SELECT id,member_id,kind,state,request_id,provider_id,provider_status,safe_code FROM payment_operations WHERE offer_id=$1 ORDER BY created_at',[session.id])).rows;
 requireFact(members.length===3&&new Set(members.map(m=>m.payer_id)).size===3,'Three independently funded buyers required');
 const observations=await Promise.all(members.map(async m=>{
  const o=order.parse(await get('/v2/checkout/orders/'+id.parse(m.order_id))),u=o.purchase_units[0];
  requireFact(u.payee.merchant_id===merchant&&parseMinor(u.amount.value)===offer.amount_minor,'Order merchant or amount mismatch');
  requireFact(u.reference_id===m.id&&u.custom_id===session.id,'Order binding mismatch');
  const payer=o.payer?.payer_id??o.payment_source?.paypal.account_id;requireFact(payer===buyers[m.ordinal]&&payer===m.payer_id,'Buyer identity mismatch');
  const authorization=resource.parse(await get('/v2/payments/authorizations/'+id.parse(m.authorization_id)));
  requireFact(authorization.id===m.authorization_id&&parseMinor(authorization.amount.value)===offer.amount_minor,'Authorization mismatch');
  requireFact(u.payments?.authorizations?.some(a=>a.id===authorization.id),'Authorization does not belong to this order');
  const financial=[];
  for(const op of ops.filter(op=>op.member_id===m.id&&['CAPTURE','REFUND'].includes(op.kind)&&op.provider_id)){
   const path=op.kind==='CAPTURE'?'/v2/payments/captures/':'/v2/payments/refunds/';const raw=await get(path+id.parse(op.provider_id)),r=resource.parse(raw);
   requireFact(r.id===op.provider_id&&parseMinor(r.amount.value)===offer.amount_minor,'Financial resource amount mismatch');
   if(raw.invoice_id)requireFact(raw.invoice_id===op.id,'Financial invoice binding mismatch');
   // The application adapter verifies capture-parent ownership before recording
   // success; this independent GET rechecks exact resource ID, amount and status.
   financial.push({operationId:op.id,kind:op.kind,resourceId:r.id,status:r.status,amountMinor:parseMinor(r.amount.value),currency:r.amount.currency_code,
    sellerReceivable:op.kind==='CAPTURE'?raw.seller_receivable_breakdown?{grossAmount:amount.parse(raw.seller_receivable_breakdown.gross_amount),paypalFee:amount.parse(raw.seller_receivable_breakdown.paypal_fee),netAmount:amount.parse(raw.seller_receivable_breakdown.net_amount)}:null:undefined});
  }
  const orderCaptureIds=u.payments?.captures?.map(c=>c.id)??[];
  const recordedCaptureIds=financial.filter(f=>f.kind==='CAPTURE').map(f=>f.resourceId);
  requireFact(orderCaptureIds.length===recordedCaptureIds.length&&orderCaptureIds.every(id=>recordedCaptureIds.includes(id)),'Unexpected or unrecorded provider capture');
  return {orderCaptureIds,buyer:m.ordinal+1,expectedBuyerMatched:true,payerDigest:createHash('sha256').update(payer!).digest('hex'),orderId:o.id,orderStatus:o.status,merchantMatched:true,
   expectedAmountMinor:offer.amount_minor,observedOrderAmountMinor:parseMinor(u.amount.value),currency:u.amount.currency_code,authorization:{id:authorization.id,status:authorization.status},financial};
 }));
 const captures=observations.flatMap(o=>o.financial.filter(f=>f.kind==='CAPTURE')),refunds=observations.flatMap(o=>o.financial.filter(f=>f.kind==='REFUND'));
 if(scenario==='partial-failure'){
  requireFact(offer.state==='ABORTED'&&offer.cleanup==='COMPLETE','Abort and completed cleanup required');
  requireFact(captures.length===1&&captures.every(c=>['COMPLETED','REFUNDED'].includes(c.status))&&refunds.length===1&&refunds[0].status==='COMPLETED','One completed capture and actual refund required');
  requireFact(observations.slice(1).every(o=>o.authorization.status==='VOIDED'),'Uncaptured authorizations must be voided');
 }else{requireFact(offer.state==='CONFIRMED'&&captures.length===3&&captures.every(c=>c.status==='COMPLETED')&&refunds.length===0,'Three completed captures and confirmation required');}
 const events=(await pool.query('SELECT event_type,state,operation_id,occurred_at FROM payment_events WHERE offer_id=$1 ORDER BY seq',[session.id])).rows;
 if(scenario==='lost-response')requireFact(events.some(e=>e.event_type==='UNKNOWN')&&events.some(e=>e.event_type==='RECONCILING'),'Dropped response and reconciliation evidence required');
 const codeHashes=Object.fromEntries(await Promise.all(['src/payments/engine.ts','src/payments/paypal.ts','scripts/sandbox.ts','scripts/verify-sandbox.ts'].map(async file=>[file,createHash('sha256').update(await readFile(new URL('../'+file,import.meta.url))).digest('hex')])));
 const evidence={codeHashes,mode:'actual_paypal_sandbox',scenario,syntheticOffering:true,scope:'Actual sandbox orders, authorizations and financial resources with local PostgreSQL application; no live payments or merchant validation.',
  verifiedAt:new Date().toISOString(),commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),verifier:'scripts/verify-sandbox.ts',offer,observations,operations:ops.map(({member_id,...safe})=>safe),events,
  totals:{capturedGrossMinor:captures.reduce((sum,c)=>sum+c.amountMinor,0),refundedGrossMinor:refunds.reduce((sum,r)=>sum+r.amountMinor,0),currency:'USD'}};
 const output=new URL('../evidence/private/verified-'+scenario+'-'+session.id+'.json',import.meta.url);await writeFile(output,JSON.stringify(evidence,null,2),{mode:0o600});
 console.log(JSON.stringify({verified:true,scenario,booking:offer.state,cleanup:offer.cleanup,...evidence.totals,evidence:output.pathname}));
}catch(error){console.error(error instanceof Error?error.message:'Sandbox verification failed');process.exitCode=1;}finally{await pool.end();}
