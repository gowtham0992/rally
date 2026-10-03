import { z } from 'zod';
import {appOrigin} from '../web/security.ts';
import { ProviderError, decimal, parseMinor, type Kind, type Observation, type Operation, type PaymentProvider } from './types.ts';

const id = z.string().regex(/^[A-Za-z0-9_-]{1,127}$/);
const amount = z.object({ value:z.string(),currency_code:z.string() });
const payment = z.object({ id,status:z.string(),amount,invoice_id:z.string().optional(),expiration_time:z.string().optional() }).passthrough();
const order = z.object({ id,intent:z.string(),status:z.string(),
  payer:z.object({ payer_id:id }).passthrough().optional(),
  payment_source:z.object({ paypal:z.object({ account_id:id.optional() }).passthrough().optional() }).passthrough().optional(),
  purchase_units:z.array(z.object({ reference_id:z.string(),custom_id:z.string().optional(),amount,
    payee:z.object({ merchant_id:z.string().optional() }).passthrough(),
    payments:z.object({ authorizations:z.array(payment).optional(),captures:z.array(payment).optional() }).optional() }).passthrough()),
  links:z.array(z.object({ rel:z.string(),href:z.string(),method:z.string().optional() })).optional() }).passthrough();
const safeIssue = z.string().regex(/^[A-Z0-9_]{1,100}$/);
const base = 'https://api-m.sandbox.paypal.com';

export class PayPalSandbox implements PaymentProvider {
  readonly mode = 'sandbox' as const;
  private token?: { value:string; expires:number };
  constructor(private config:{ clientId:string; clientSecret:string; merchantId:string; webhookId?:string; returnOrigin?:string },private transport:typeof fetch = fetch) {
    if(config.returnOrigin)appOrigin(config.returnOrigin);
    if (!config.clientId || !config.clientSecret || !config.merchantId) throw new Error('PayPal sandbox app credentials and merchant ID are required');
  }
  // Current endpoint docs confirm request-ID support but omit retention duration.
  // Keep automatic mutation replay disabled until an endpoint-specific duration is
  // verified. Resource reads and verified webhook correlation remain available.
  retentionMs(_kind:Kind):number|null { return null; }
  private async accessToken():Promise<string> {
    if (this.token && this.token.expires > Date.now()+60000) return this.token.value;
    let response:Response;
    try {
      response = await this.transport(`${base}/v1/oauth2/token`,{ method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),
        headers:{ Authorization:`Basic ${Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString('base64')}`,'Content-Type':'application/x-www-form-urlencoded' },body:'grant_type=client_credentials' });
    } catch { throw new ProviderError('TOKEN_UNAVAILABLE'); }
    if (!response.ok) throw new ProviderError('TOKEN_UNAVAILABLE');
    const result = z.object({ access_token:z.string().min(1),expires_in:z.number().positive() }).parse(await response.json());
    this.token = { value:result.access_token,expires:Date.now()+result.expires_in*1000 };
    return result.access_token;
  }
  private async request(path:string,body?:unknown,requestId?:string):Promise<unknown> {
    const token = await this.accessToken();
    let response:Response;
    try {
      response = await this.transport(`${base}${path}`,{ method:body === undefined ? 'GET' : 'POST',redirect:'error',signal:AbortSignal.timeout(15000),
        headers:{ Authorization:`Bearer ${token}`,'Content-Type':'application/json',Prefer:'return=representation',...(requestId ? {'PayPal-Request-Id':requestId} : {}) },
        ...(body === undefined ? {} : {body:JSON.stringify(body)}) });
    } catch { throw new ProviderError('NETWORK_OUTCOME_UNKNOWN'); }
    if (!response.ok) {
      let issue = 'PROVIDER_REJECTED';
      try {
        const value = z.object({ details:z.array(z.object({ issue:safeIssue })).optional() }).parse(await response.json());
        issue = value.details?.[0]?.issue ?? issue;
      } catch { /* Never copy raw provider errors (which may contain payer details). */ }
      const definitive = ['AUTHORIZATION_VOIDED','AUTHORIZATION_EXPIRED','AUTHORIZATION_DENIED','INSTRUMENT_DECLINED','TRANSACTION_REFUSED'].includes(issue);
      throw new ProviderError(issue,definitive);
    }
    if (response.status === 204) return null;
    try { return await response.json(); } catch { throw new ProviderError('RESPONSE_OUTCOME_UNKNOWN'); }
  }
  private checkMoney(value:z.infer<typeof amount>,op:Operation) {
    if (value.currency_code !== 'USD' || parseMinor(value.value) !== op.payload.amountMinor) throw new ProviderError('PROVIDER_AMOUNT_MISMATCH');
  }
  private checkOrder(value:unknown,op:Operation) {
    const result = order.parse(value);
    const unit = result.purchase_units[0];
    if (result.intent !== 'AUTHORIZE' || result.purchase_units.length !== 1 || !unit || unit.reference_id !== op.payload.referenceId
      || unit.custom_id !== op.payload.offerId || unit.payee.merchant_id !== op.payload.merchantId || op.payload.merchantId !== this.config.merchantId)
      throw new ProviderError('PROVIDER_BINDING_MISMATCH');
    this.checkMoney(unit.amount,op);
    return result;
  }
  private paymentResult(value:unknown,op:Operation):Observation {
    const result = payment.parse(value);
    this.checkMoney(result.amount,op);
    if (['CAPTURE','REFUND'].includes(op.kind)) {
      const resource = payment.extend({links:z.array(z.object({rel:z.string(),href:z.string()})).optional()}).parse(value);
      if (resource.invoice_id && resource.invoice_id !== op.id) throw new ProviderError('PROVIDER_INVOICE_MISMATCH');
      if (op.provider_id && resource.id !== op.provider_id) throw new ProviderError('PROVIDER_RESOURCE_MISMATCH');
      if (!resource.invoice_id) {
        const up=resource.links?.find(l=>l.rel==='up')?.href;
        const expected=`/v2/payments/${op.kind === 'REFUND' ? 'captures' : 'authorizations'}/${op.payload.parentId}`;
        if (!up) throw new ProviderError('MISSING_PAYMENT_BINDING');
        const url=new URL(up);
        if (![base,'https://api.sandbox.paypal.com'].includes(url.origin) || url.pathname !== expected) throw new ProviderError('PROVIDER_PARENT_MISMATCH');
      }
    }
    const success = op.kind === 'AUTHORIZE' ? result.status === 'CREATED' : result.status === 'COMPLETED';
    const failed = ['DECLINED','FAILED','DENIED','CANCELLED'].includes(result.status);
    return { outcome:success ? 'success' : failed ? 'failure' : 'pending',id:result.id,status:result.status,
      ...(result.expiration_time ? {expiresAt:result.expiration_time} : {}) };
  }
  private approval(value:z.infer<typeof order>):string|undefined {
    const href = value.links?.find(l => l.rel === 'approve' || l.rel === 'payer-action')?.href;
    if (!href) return undefined;
    const url = new URL(href);
    if (url.protocol !== 'https:' || url.hostname !== 'www.sandbox.paypal.com') throw new ProviderError('INVALID_APPROVAL_URL');
    return href;
  }
  async execute(op:Operation):Promise<Observation> {
    if (op.payload.merchantId !== this.config.merchantId) throw new ProviderError('MERCHANT_MISMATCH');
    const parent = op.payload.parentId ? id.parse(op.payload.parentId) : undefined;
    const expected = { currency_code:'USD',value:decimal(op.payload.amountMinor) };
    if (op.kind === 'CREATE_ORDER') {
      const result = this.checkOrder(await this.request('/v2/checkout/orders',{
        intent:'AUTHORIZE',purchase_units:[{ reference_id:op.payload.referenceId,custom_id:op.payload.offerId,amount:expected,payee:{merchant_id:this.config.merchantId} }],
        payment_source:{paypal:{experience_context:{shipping_preference:'NO_SHIPPING',user_action:'CONTINUE',...(this.config.returnOrigin?{return_url:`${this.config.returnOrigin}/offers/${z.uuid().parse(op.payload.offerId)}?paypal=returned`,cancel_url:`${this.config.returnOrigin}/offers/${op.payload.offerId}?paypal=canceled`}:{})}}}
      },op.request_id),op);
      return {outcome:'success',id:result.id,status:result.status,approvalUrl:this.approval(result)};
    }
    if (!parent) throw new ProviderError('MISSING_PARENT');
    if (op.kind === 'AUTHORIZE') {
      const approved = this.checkOrder(await this.request(`/v2/checkout/orders/${parent}`),op);
      if (approved.status !== 'APPROVED' && approved.status !== 'COMPLETED') throw new ProviderError('PAYER_APPROVAL_REQUIRED',true);
      const existing = approved.purchase_units[0].payments?.authorizations?.[0];
      const result = existing ? approved : this.checkOrder(await this.request(`/v2/checkout/orders/${parent}/authorize`,{},op.request_id),op);
      const authorization = result.purchase_units[0].payments?.authorizations?.[0];
      if (!authorization || result.purchase_units[0].payments?.authorizations?.length !== 1) throw new ProviderError('MISSING_AUTHORIZATION');
      const payerId = result.payer?.payer_id ?? result.payment_source?.paypal?.account_id;
      if (!payerId) throw new ProviderError('MISSING_PAYER');
      return {...this.paymentResult(authorization,op),payerId};
    }
    if (op.kind === 'CAPTURE') {
      try {
        return this.paymentResult(await this.request(`/v2/payments/authorizations/${parent}/capture`,{ amount:expected,final_capture:true,invoice_id:op.id },op.request_id),op);
      } catch (error) {
        // A 422 such as "already completed" is not proof of failure. Provider state
        // VOIDED/EXPIRED, however, establishes an uncapturable authorization.
        const known = await this.observe(op);
        if (known) return known;
        throw error;
      }
    }
    if (op.kind === 'REFUND') return this.paymentResult(await this.request(`/v2/payments/captures/${parent}/refund`,{amount:expected,invoice_id:op.id},op.request_id),op);
    const before = payment.parse(await this.request(`/v2/payments/authorizations/${parent}`));
    this.checkMoney(before.amount,op);
    if (before.status === 'VOIDED' || before.status === 'EXPIRED') return {outcome:'success',id:parent,status:before.status};
    if (before.status !== 'CREATED') throw new ProviderError('VOID_REQUIRES_RECONCILIATION');
    await this.request(`/v2/payments/authorizations/${parent}/void`,{},op.request_id);
    const after = payment.parse(await this.request(`/v2/payments/authorizations/${parent}`));
    return {outcome:after.status === 'VOIDED' ? 'success' : 'pending',id:parent,status:after.status};
  }
  async observe(op:Operation):Promise<Observation|null> {
    if (op.kind === 'CREATE_ORDER') {
      if (!op.provider_id) return null;
      const result = this.checkOrder(await this.request(`/v2/checkout/orders/${id.parse(op.provider_id)}`),op);
      return {outcome:'success',id:result.id,status:result.status,approvalUrl:this.approval(result)};
    }
    const parent = id.parse(op.payload.parentId);
    if (op.kind === 'AUTHORIZE') {
      const result = this.checkOrder(await this.request(`/v2/checkout/orders/${parent}`),op);
      const auth = result.purchase_units[0].payments?.authorizations?.[0];
      if (!auth) return null;
      const payerId = result.payer?.payer_id ?? result.payment_source?.paypal?.account_id;
      if (!payerId) throw new ProviderError('MISSING_PAYER');
      // VOIDED authorization observed after a lost authorize response still requires
      // its ID to be recorded for audit, but never qualifies for a new settlement.
      const observation = this.paymentResult(auth,op);
      return {...observation,...(['VOIDED','EXPIRED'].includes(auth.status) ? {outcome:'success' as const} : {}),payerId};
    }
    if (op.kind === 'VOID') {
      const auth = payment.parse(await this.request(`/v2/payments/authorizations/${parent}`));
      this.checkMoney(auth.amount,op);
      return ['VOIDED','EXPIRED'].includes(auth.status) ? {outcome:'success',id:parent,status:auth.status} : null;
    }
    if (op.provider_id) return this.paymentResult(await this.request(`/v2/payments/${op.kind === 'REFUND' ? 'refunds' : 'captures'}/${id.parse(op.provider_id)}`),op);
    if (op.kind === 'REFUND') return null; // A verified webhook can attach the refund ID.
    // Lost capture response: discover only this operation's invoice on its own order.
    // Parent ID is an authorization, so the trusted authorization's 'up' relation
    // identifies its order; never follow arbitrary provider-supplied URLs.
    const raw = await this.request(`/v2/payments/authorizations/${parent}`);
    const auth = payment.extend({links:z.array(z.object({rel:z.string(),href:z.string()})).optional()}).parse(raw);
    this.checkMoney(auth.amount,op);
    const up = auth.links?.find(l => l.rel === 'up')?.href;
    if (up) {
      const url = new URL(up);
      if (![base,'https://api.sandbox.paypal.com'].includes(url.origin) || !/^\/v2\/checkout\/orders\/[A-Za-z0-9_-]+$/.test(url.pathname)) throw new ProviderError('INVALID_PROVIDER_LINK');
      const result = this.checkOrder(await this.request(url.pathname),op);
      const capture = result.purchase_units[0].payments?.captures?.find(c => c.invoice_id === op.id);
      if (capture) return this.paymentResult(capture,op);
    }
    if (['VOIDED','EXPIRED','DENIED'].includes(auth.status)) return {outcome:'failure',status:auth.status,code:'AUTHORIZATION_UNAVAILABLE'};
    return null;
  }
  async verifyWebhook(headers:Record<string,string>,event:unknown):Promise<boolean> {
    if (!this.config.webhookId) throw new ProviderError('WEBHOOK_NOT_CONFIGURED');
    const result = z.object({verification_status:z.string()}).parse(await this.request('/v1/notifications/verify-webhook-signature',{
      transmission_id:headers['paypal-transmission-id'],transmission_time:headers['paypal-transmission-time'],
      cert_url:headers['paypal-cert-url'],auth_algo:headers['paypal-auth-algo'],transmission_sig:headers['paypal-transmission-sig'],
      webhook_id:this.config.webhookId,webhook_event:event
    }));
    return result.verification_status === 'SUCCESS';
  }
}
