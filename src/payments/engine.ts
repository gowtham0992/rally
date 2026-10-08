import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { transaction } from '../db.ts';
import { DomainError, ProviderError, fingerprint, type Kind, type Member, type Offer, type Operation, type Observation, type PaymentProvider, type ParticipantPayment } from './types.ts';

const commandSchema = z.strictObject({ commandId: z.uuid(), offerId: z.uuid(), actorId: z.uuid(), offerHash: z.string().length(64) });
type Command = z.infer<typeof commandSchema>;
const terminal = new Set(['EXPIRED','WITHDRAWN','SUPERSEDED','ABORTED','CANCELED']);
const uncertain = new Set(['DISPATCHED','UNKNOWN','PENDING','ACTION_REQUIRED']);
const at = <T extends { kind: Kind }>(ops: T[], kind: Kind) => ops.find(o => o.kind === kind);

// Only trusted server routes may supply actorId, after managed authentication. This
// service still checks resource ownership; it never accepts browser-supplied amounts.
export class PaymentEngine {
  private delayMs:number;
  constructor(readonly pool: pg.Pool, readonly provider: PaymentProvider,options:{reconcileDelayMs?:number} = {}) {
    this.delayMs=z.number().int().min(0).max(60000).parse(options.reconcileDelayMs ?? 3000);
  }

  private async lock(client: PoolClient, id: string): Promise<Offer> {
    const { rows } = await client.query<Offer>('SELECT * FROM offers WHERE id=$1 FOR UPDATE',[id]);
    if (!rows[0]) throw new DomainError('OFFER_NOT_FOUND',404);
    return rows[0];
  }
  private async time(client: PoolClient): Promise<Date> {
    return (await client.query<{ time: Date }>('SELECT clock_timestamp() AS time')).rows[0].time;
  }
  private async event(client: PoolClient, offer: Offer, name: string, operationId?: string) {
    await client.query('INSERT INTO payment_events(offer_id,event_type,operation_id,state) VALUES($1,$2,$3,$4)',[offer.id,name,operationId ?? null,offer.state]);
  }
  private async transition(client: PoolClient, offer: Offer, state: Offer['state']) {
    offer.state = state;
    await client.query('UPDATE offers SET state=$2,revision=revision+1 WHERE id=$1',[offer.id,state]);
    if (terminal.has(state)) {
      await client.query("UPDATE reservations SET state='RELEASED' WHERE offer_id=$1 AND state='HELD'",[offer.id]);
      if(state==='CANCELED')await client.query("UPDATE reservations SET state='CANCELED' WHERE offer_id=$1 AND state='BOOKED'",[offer.id]);
      await client.query("UPDATE offers SET cleanup='REQUIRED' WHERE id=$1",[offer.id]);
    }
    await this.event(client,offer,state);
  }
  private async recordCommand(client: PoolClient, input: Command, action: string, fn: () => Promise<unknown>) {
    const hash = fingerprint({ action,...input });
    const prior = (await client.query('SELECT * FROM command_results WHERE id=$1',[input.commandId])).rows[0];
    if (prior) {
      if (prior.actor_id !== input.actorId || prior.payload_hash !== hash) throw new DomainError('COMMAND_CONFLICT');
      return prior.result;
    }
    const result = await fn();
    await client.query('INSERT INTO command_results(id,actor_id,payload_hash,result) VALUES($1,$2,$3,$4)',[input.commandId,input.actorId,hash,JSON.stringify(result)]);
    return result;
  }
  private async member(client: PoolClient, input: Command): Promise<Member> {
    const member = (await client.query<Member>('SELECT * FROM offer_members WHERE offer_id=$1 AND user_id=$2',[input.offerId,input.actorId])).rows[0];
    if (!member) throw new DomainError('NOT_A_MEMBER',403);
    return member;
  }
  private async operation(client: PoolClient, offer: Offer, member: Member, kind: Kind, parentId?: string) {
    const id = randomUUID();
    const payload = { merchantId: offer.merchant_id,amountMinor: offer.amount_minor,currency: offer.currency,
      offerId: offer.id,memberId: member.id,referenceId: member.id,...(parentId ? { parentId } : {}) };
    const { rows } = await client.query<Operation>(`INSERT INTO payment_operations(id,offer_id,member_id,kind,state,request_id,payload,payload_hash)
      VALUES($1,$2,$3,$4,'PLANNED',$5,$6,$7) ON CONFLICT(member_id,kind) DO UPDATE SET member_id=EXCLUDED.member_id RETURNING *`,
      [id,offer.id,member.id,kind,randomUUID(),JSON.stringify(payload),fingerprint(payload)]);
    return rows[0];
  }
  async accept(value: unknown) {
    const input = commandSchema.parse(value);
    return transaction(this.pool,async client => {
      const offer = await this.lock(client,input.offerId);
      const member = await this.member(client,input);
      return this.recordCommand(client,input,'ACCEPT',async () => {
        if (offer.offer_hash !== input.offerHash) throw new DomainError('STALE_OFFER');
        if (offer.state !== 'OPEN' || (await this.time(client)) >= offer.deadline) throw new DomainError('OFFER_CLOSED');
        await client.query('UPDATE offer_members SET accepted_hash=$2,accepted_at=COALESCE(accepted_at,clock_timestamp()) WHERE id=$1',[member.id,offer.offer_hash]);
        const op = await this.operation(client,offer,member,'CREATE_ORDER');
        await this.event(client,offer,'ACCEPTED',op.id);
        return { operationId: op.id };
      });
    });
  }
  async authorize(value: unknown) {
    const input = commandSchema.parse(value);
    return transaction(this.pool,async client => {
      const offer = await this.lock(client,input.offerId);
      const member = await this.member(client,input);
      return this.recordCommand(client,input,'AUTHORIZE',async () => {
        if (offer.offer_hash !== input.offerHash || member.accepted_hash !== offer.offer_hash) throw new DomainError('STALE_ACCEPTANCE');
        if (offer.state !== 'OPEN' || (await this.time(client)) >= offer.deadline) throw new DomainError('OFFER_CLOSED');
        if (!member.order_id) throw new DomainError('ORDER_NOT_READY');
        const op = await this.operation(client,offer,member,'AUTHORIZE',member.order_id);
        // This exact failure occurs before the authorize POST. No provider mutation
        // happened, so a later buyer approval may safely resume the same operation.
        await client.query("UPDATE payment_operations SET state='PLANNED',safe_code=NULL WHERE id=$1 AND state='FAILED' AND safe_code='PAYER_APPROVAL_REQUIRED'",[op.id]);
        return { operationId: op.id };
      });
    });
  }
  async withdraw(value: unknown) {
    const input = commandSchema.parse(value);
    return transaction(this.pool,async client => {
      const offer = await this.lock(client,input.offerId);
      await this.member(client,input);
      return this.recordCommand(client,input,'WITHDRAW',async () => {
        if (offer.offer_hash !== input.offerHash) throw new DomainError('STALE_OFFER');
        if (offer.state !== 'OPEN') throw new DomainError('CANCELLATION_REVIEW_REQUIRED');
        await this.transition(client,offer,'WITHDRAWN');
        return { state: 'WITHDRAWN' };
      });
    });
  }

  async requestCancellation(value:unknown){
    const input=commandSchema.parse(value);
    return transaction(this.pool,async client=>{
      const offer=await this.lock(client,input.offerId),member=await this.member(client,input);
      return this.recordCommand(client,input,'REQUEST_CANCELLATION',async()=>{
        if(offer.offer_hash!==input.offerHash)throw new DomainError('STALE_OFFER');
        if(!['SETTLING','CONFIRMED'].includes(offer.state))throw new DomainError('OFFER_CLOSED');
        const inserted=await client.query('INSERT INTO cancellation_requests(member_id) VALUES($1) ON CONFLICT DO NOTHING RETURNING member_id',[member.id]);
        if(inserted.rowCount)await this.event(client,offer,'CANCELLATION_REQUESTED');
        return {requested:true};
      });
    });
  }

  async cancelByMerchant(value:unknown){
    const {agreesToFullRefund,...input}=commandSchema.extend({agreesToFullRefund:z.literal(true)}).parse(value);
    return transaction(this.pool,async client=>{
      const offer=await this.lock(client,input.offerId);
      const owns=await client.query(`SELECT 1 FROM offer_snapshots os JOIN merchant_studios s
        ON s.studio_id=os.snapshot->'candidate'->>'studioId' WHERE os.offer_id=$1 AND s.owner_user_id=$2`,[input.offerId,input.actorId]);
      if(!owns.rowCount)throw new DomainError('NOT_FOUND',404);
      return this.recordCommand(client,input,'MERCHANT_CANCEL',async()=>{
        if(offer.offer_hash!==input.offerHash)throw new DomainError('STALE_OFFER');
        if(!['OPEN','SETTLING','CONFIRMED'].includes(offer.state))throw new DomainError('OFFER_CLOSED');
        const reservation=(await client.query('SELECT state FROM reservations WHERE offer_id=$1 FOR UPDATE',[offer.id])).rows[0];
        if(!reservation||!['HELD','BOOKED'].includes(reservation.state))throw new DomainError('CANCELLATION_REVIEW_REQUIRED');
        await this.transition(client,offer,'CANCELED');
        return {state:'CANCELED',cleanup:'REQUIRED'};
      });
    });
  }

  private async plan(client: PoolClient, offer: Offer) {
    const now = await this.time(client);
    if (offer.state === 'OPEN' && now >= offer.deadline) await this.transition(client,offer,'EXPIRED');
    if (offer.state === 'SETTLING' && now >= offer.reservation_end) await this.transition(client,offer,'ABORTED');
    const members = (await client.query<Member>('SELECT * FROM offer_members WHERE offer_id=$1 ORDER BY ordinal',[offer.id])).rows;
    const ops = (await client.query<Operation>('SELECT * FROM payment_operations WHERE offer_id=$1',[offer.id])).rows;
    if (offer.state === 'SETTLING') {
      const captures = ops.filter(o => o.kind === 'CAPTURE');
      if (captures.some(o => o.state === 'FAILED')) await this.transition(client,offer,'ABORTED');
      else if (captures.length === members.length && members.length > 0 && captures.every(o => o.state === 'SUCCEEDED')) {
        const reservation = (await client.query("SELECT * FROM reservations WHERE offer_id=$1 AND state='HELD' FOR UPDATE",[offer.id])).rows[0];
        if (!reservation || (await this.time(client)) >= offer.reservation_end) await this.transition(client,offer,'ABORTED');
        else {
          await client.query("UPDATE reservations SET state='BOOKED' WHERE offer_id=$1",[offer.id]);
          await this.transition(client,offer,'CONFIRMED');
        }
      } else {
        for (const member of members) {
          const capture = at(ops.filter(o => o.member_id === member.id),'CAPTURE');
          if (capture?.state === 'SUCCEEDED') continue;
          if (!capture) {
            if (!member.authorization_id || !member.qualified_at) throw new DomainError('INVALID_SETTLEMENT');
            await this.operation(client,offer,member,'CAPTURE',member.authorization_id);
          }
          break; // A pending or unknown earlier capture prevents every later one.
        }
      }
    }
    if (terminal.has(offer.state)) {
      await client.query(`UPDATE payment_operations SET state='FAILED',safe_code='CANCELED_BEFORE_DISPATCH'
        WHERE offer_id=$1 AND state='PLANNED' AND kind IN ('CREATE_ORDER','AUTHORIZE','CAPTURE')`,[offer.id]);
      let complete = true;
      for (const member of members) {
        const mops = ops.filter(o => o.member_id === member.id);
        const auth = at(mops,'AUTHORIZE'), capture = at(mops,'CAPTURE');
        if ((auth && uncertain.has(auth.state)) || (capture && uncertain.has(capture.state))) { complete = false; continue; }
        if (capture?.state === 'SUCCEEDED') {
          const refund = at(mops,'REFUND');
          if (refund?.state !== 'SUCCEEDED') { complete = false; await this.operation(client,offer,member,'REFUND',capture.provider_id!); }
        } else if (member.authorization_id) {
          const voidOp = at(mops,'VOID');
          if (voidOp?.state !== 'SUCCEEDED') { complete = false; await this.operation(client,offer,member,'VOID',member.authorization_id); }
        }
      }
      const failedCleanup = ops.some(o => ['VOID','REFUND'].includes(o.kind) && ['FAILED','ACTION_REQUIRED'].includes(o.state));
      const action = ops.some(o => o.state === 'ACTION_REQUIRED');
      const cleanup = complete ? 'COMPLETE' : (failedCleanup || action) ? 'ACTION_REQUIRED' : 'RUNNING';
      if (offer.cleanup !== cleanup) {
        await client.query('UPDATE offers SET cleanup=$2 WHERE id=$1',[offer.id,cleanup]);
        offer.cleanup = cleanup;
        await this.event(client,offer,`CLEANUP_${cleanup}`);
      }
    }
  }

  // A single step commits dispatch intent before any network call. It is also safe to
  // call from multiple worker processes: offer lock + per-operation lease fence state.
  async step(offerId: string): Promise<boolean> {
    z.uuid().parse(offerId);
    const claim = await transaction(this.pool,async client => {
      const offer = await this.lock(client,offerId);
      await this.plan(client,offer);
      const op = (await client.query<Operation>(`SELECT * FROM payment_operations WHERE offer_id=$1
        AND state IN ('PLANNED','DISPATCHED','UNKNOWN','PENDING','ACTION_REQUIRED')
        AND (lease_until IS NULL OR lease_until < clock_timestamp())
        AND next_check_at <= clock_timestamp()
        ORDER BY CASE state WHEN 'PLANNED' THEN 1 ELSE 0 END,created_at,id LIMIT 1 FOR UPDATE`,[offerId])).rows[0];
      if (!op) return null;
      const first = op.state === 'PLANNED';
      const token = randomUUID();
      const retention = this.provider.retentionMs(op.kind);
      await client.query(`UPDATE payment_operations SET state='DISPATCHED',lease_token=$2,lease_until=clock_timestamp()+interval '45 seconds',
        dispatched_at=COALESCE(dispatched_at,clock_timestamp()),
        retry_until=CASE WHEN dispatched_at IS NULL AND $3::bigint IS NOT NULL THEN clock_timestamp()+$3::bigint*interval '1 millisecond' ELSE retry_until END,
        attempts=attempts+1,updated_at=clock_timestamp() WHERE id=$1`,[op.id,token,retention]);
      await this.event(client,offer,first ? 'DISPATCHED' : 'RECONCILING',op.id);
      return { op,token,first };
    });
    if (!claim) return false;
    const { op,token,first } = claim;
    let observation: Observation | null = null;
    let actionRequired = false;
    try {
      if (fingerprint(op.payload) !== op.payload_hash) throw new ProviderError('PAYLOAD_CHANGED');
      if (first) observation = await this.provider.execute(op);
      else {
        observation = await this.provider.observe(op);
        if (!observation) {
          // Read-only reconciliation comes first. Never replay a known pending resource.
          const time = (await this.pool.query<{ time: Date }>('SELECT clock_timestamp() AS time')).rows[0].time;
          if (op.state !== 'PENDING' && op.retry_until && time < op.retry_until) observation = await this.provider.execute(op);
          else actionRequired = true;
        }
      }
    } catch (error) {
      if (error instanceof ProviderError && error.definitive) observation = { outcome:'failure',status:'REJECTED',code:error.code };
      // Timeout, malformed response, authentication/server error: outcome remains unknown.
    }
    await transaction(this.pool,async client => {
      const offer = await this.lock(client,offerId);
      const current = (await client.query<Operation>('SELECT * FROM payment_operations WHERE id=$1 FOR UPDATE',[op.id])).rows[0];
      if (current.lease_token !== token) return;
      const state = observation ? ({ success:'SUCCEEDED',failure:'FAILED',pending:'PENDING' } as const)[observation.outcome] : actionRequired ? 'ACTION_REQUIRED' : 'UNKNOWN';
      await client.query(`UPDATE payment_operations SET state=$2,provider_id=COALESCE($3,provider_id),provider_status=$4,
        safe_code=$5,approval_url=COALESCE($6,approval_url),lease_until=NULL,lease_token=NULL,updated_at=clock_timestamp(),
        next_check_at=clock_timestamp()+$7::bigint*interval '1 millisecond' WHERE id=$1`,
        [op.id,state,observation?.id ?? null,observation?.status ?? 'UNKNOWN',observation?.code ?? (actionRequired ? 'RECONCILIATION_REQUIRED' : 'OUTCOME_UNKNOWN'),observation?.approvalUrl ?? null,
          ['UNKNOWN','PENDING','ACTION_REQUIRED'].includes(state) ? this.delayMs : 0]);
      if (state === 'SUCCEEDED' && op.kind === 'CREATE_ORDER') {
        await client.query('UPDATE offer_members SET order_id=$2 WHERE id=$1',[op.member_id,observation!.id]);
      }
      if (state === 'SUCCEEDED' && op.kind === 'AUTHORIZE') {
        if (!observation?.payerId || !observation.id || !observation.expiresAt) throw new DomainError('MISSING_AUTHORIZATION_EVIDENCE');
        const now = await this.time(client);
        const member = (await client.query<Member>('SELECT * FROM offer_members WHERE id=$1',[op.member_id])).rows[0];
        const duplicate = await client.query('SELECT 1 FROM offer_members WHERE offer_id=$1 AND id<>$2 AND payer_id=$3',[offerId,member.id,observation.payerId]);
        const qualifies = observation.status === 'CREATED' && !duplicate.rowCount && offer.state === 'OPEN' && now < offer.deadline && new Date(observation.expiresAt) > offer.reservation_end && member.accepted_hash === offer.offer_hash;
        // Preserve nonqualifying authorizations so duplicate buyers can be refunded/
        // voided. The partial unique index protects qualifying independent payers.
        await client.query('UPDATE offer_members SET authorization_id=$2,payer_id=$3,qualified_at=$4 WHERE id=$1',
          [member.id,observation.id,observation.payerId,qualifies ? now : null]);
        if (qualifies) {
          const missing = await client.query('SELECT 1 FROM offer_members WHERE offer_id=$1 AND qualified_at IS NULL',[offerId]);
          const held = await client.query("SELECT 1 FROM reservations WHERE offer_id=$1 AND state='HELD'",[offerId]);
          if (!missing.rowCount && held.rowCount && (await this.time(client)) < offer.deadline) await this.transition(client,offer,'SETTLING');
        } else if (offer.state === 'OPEN') await this.transition(client,offer,duplicate.rowCount ? 'ABORTED' : 'EXPIRED');
      }
      await this.event(client,offer,state,op.id);
    });
    return true;
  }

  async participantStatus(offerId: string, actorId: string) {
    z.uuid().parse(offerId); z.uuid().parse(actorId);
    // One database snapshot binds booking, owned member and operation states.
    const row=(await this.pool.query<Offer&{accepted_hash:string|null;order_id:string|null;time:Date;verified_approvals:number;approval_total:number;ops:(Pick<Operation,'kind'|'state'|'approval_url'>&{safe_code:string|null})[]}>(`SELECT o.*,m.accepted_hash,m.order_id,clock_timestamp() AS time,
      (SELECT count(*)::integer FROM offer_members peers WHERE peers.offer_id=o.id AND peers.qualified_at IS NOT NULL) AS verified_approvals,
      (SELECT count(*)::integer FROM offer_members peers WHERE peers.offer_id=o.id) AS approval_total,
      (SELECT COALESCE(jsonb_agg(jsonb_build_object('kind',p.kind,'state',p.state,'approval_url',p.approval_url,'safe_code',p.safe_code)),'[]'::jsonb) FROM payment_operations p WHERE p.member_id=m.id) AS ops
      FROM offer_members m JOIN offers o ON o.id=m.offer_id WHERE m.offer_id=$1 AND m.user_id=$2`,[offerId,actorId])).rows[0];
    if(!row)throw new DomainError('NOT_A_MEMBER',403);
    const ops=row.ops,capture=at(ops,'CAPTURE'),refund=at(ops,'REFUND'),voidOp=at(ops,'VOID'),auth=at(ops,'AUTHORIZE'),create=at(ops,'CREATE_ORDER');
    const needsAction=ops.some(o=>o.state==='ACTION_REQUIRED'||(['VOID','REFUND'].includes(o.kind)&&o.state==='FAILED'))
      ||(row.state==='OPEN'&&ops.some(o=>['CREATE_ORDER','AUTHORIZE'].includes(o.kind)&&o.state==='FAILED'&&!['PAYER_APPROVAL_REQUIRED','CANCELED_BEFORE_DISPATCH'].includes(o.safe_code??'')));
    const payment:ParticipantPayment=needsAction?'STUDIO_ACTION_NEEDED'
      :refund?.state==='SUCCEEDED'?'REFUND_COMPLETED':refund?'REFUND_IN_PROGRESS'
      :capture?.state==='SUCCEEDED'?'PAYMENT_COMPLETED'
      :ops.some(o=>uncertain.has(o.state)||(o.kind==='AUTHORIZE'&&o.state==='PLANNED'))?'CHECKING_PAYMENT'
      :voidOp?.state==='SUCCEEDED'?'AUTHORIZATION_CANCELED'
      :auth?.state==='SUCCEEDED'?'AUTHORIZED_NOT_CONFIRMED':'APPROVAL_NEEDED';
    const active=row.state==='OPEN'&&row.time<row.deadline,accepted=row.accepted_hash===row.offer_hash;
    const canAuthorize=Boolean(active&&accepted&&row.order_id&&(!auth||(auth.state==='FAILED'&&auth.safe_code==='PAYER_APPROVAL_REQUIRED')));
    let approvalUrl:string|null=null;
    if(canAuthorize&&create?.state==='SUCCEEDED'&&create.approval_url){
      try{const url=new URL(create.approval_url);if(url.origin==='https://www.sandbox.paypal.com'&&!url.username&&!url.password&&url.searchParams.get('token')===row.order_id)approvalUrl=url.toString();}catch{/* Invalid persisted links are never browser destinations. */}
    }
    return {booking:row.state,payment,amountMinor:row.amount_minor,currency:row.currency,cleanup:row.cleanup,approvalUrl,
      paymentApprovalProgress:{verified:row.verified_approvals,total:row.approval_total},accepted,canAccept:active&&!accepted,canAuthorize,preparingOrder:active&&accepted&&!row.order_id&&!needsAction,
      payerApprovalRequired:auth?.state==='FAILED'&&auth.safe_code==='PAYER_APPROVAL_REQUIRED'};
  }

  async webhook(headers:Record<string,string>,value:unknown,raw?:Uint8Array) {
    if (JSON.stringify(value).length > 256000) throw new DomainError('WEBHOOK_TOO_LARGE',413);
    if (!this.provider.verifyWebhook || !await this.provider.verifyWebhook(headers,value,raw)) throw new DomainError('INVALID_WEBHOOK_SIGNATURE',403);
    const input = z.object({id:z.string().min(1).max(128),event_type:z.string().max(128),
      resource:z.object({id:z.string().min(1).max(128),invoice_id:z.string().max(128).optional()}).passthrough() }).parse(value);
    const kind = ['PAYMENT.CAPTURE.REFUNDED','PAYMENT.REFUND.PENDING','PAYMENT.REFUND.FAILED'].includes(input.event_type) ? 'REFUND'
      : ['PAYMENT.CAPTURE.COMPLETED','PAYMENT.CAPTURE.PENDING','PAYMENT.CAPTURE.DECLINED'].includes(input.event_type) ? 'CAPTURE' : null;
    return transaction(this.pool,async client => {
      const inserted = await client.query('INSERT INTO provider_webhooks(event_id,event_type,resource_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING event_id',
        [input.id,input.event_type,input.resource.id]);
      if (!inserted.rowCount) return {duplicate:true};
      if (kind && input.resource.invoice_id && z.uuid().safeParse(input.resource.invoice_id).success) {
        const target = (await client.query<Operation>('SELECT * FROM payment_operations WHERE id=$1 AND kind=$2',[input.resource.invoice_id,kind])).rows[0];
        if (target) {
          await this.lock(client,target.offer_id);
          // Attach a resource to its existing logical operation, never financial success.
          // The worker GET verifies amount and current provider status before using it.
          await client.query('UPDATE payment_operations SET provider_id=COALESCE(provider_id,$2) WHERE id=$1',[target.id,input.resource.id]);
        }
      }
      await client.query('UPDATE provider_webhooks SET processed_at=clock_timestamp() WHERE event_id=$1',[input.id]);
      return {duplicate:false};
    });
  }
}
