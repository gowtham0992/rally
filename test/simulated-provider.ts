import { ProviderError, type Operation, type Observation, type PaymentProvider } from '../src/payments/types.ts';

// A controlled external-provider simulation, not PayPal integration evidence.
// The app database, service, transactions and worker under test are real.
export class SimulatedProvider implements PaymentProvider {
  readonly mode = 'simulation' as const;
  results = new Map<string,Observation>();
  calls:Operation[] = [];
  financialEffects = {captures:0,refunds:0,voids:0};
  lostResponses = new Set<string>();
  pendingKinds = new Set<string>();
  failedMembers = new Set<string>();
  payerOverride?:string;
  retentionMs() { return 6*60*60*1000; }
  verifyWebhook?: (headers:Record<string,string>,event:unknown)=>Promise<boolean>;
  async execute(op:Operation):Promise<Observation> {
    this.calls.push(op);
    const prior = this.results.get(op.request_id);
    if (prior) return prior;
    let observation:Observation = {outcome:'success',id:`${op.kind}_${op.id}`,status:op.kind === 'AUTHORIZE' ? 'CREATED' : 'COMPLETED'};
    if (op.kind === 'CREATE_ORDER') observation.approvalUrl = `https://www.sandbox.paypal.com/checkoutnow?token=${op.id}`;
    if (op.kind === 'AUTHORIZE') { observation.payerId = this.payerOverride ?? `payer_${op.member_id}`; observation.expiresAt = '2099-01-01T00:00:00Z'; }
    if (op.kind === 'CAPTURE' && this.failedMembers.has(op.member_id)) observation = {outcome:'failure',status:'VOIDED'};
    if (this.pendingKinds.has(op.kind)) observation = {...observation,outcome:'pending',status:'PENDING'};
    if (observation.outcome === 'success') {
      if (op.kind === 'CAPTURE') this.financialEffects.captures++;
      if (op.kind === 'REFUND') this.financialEffects.refunds++;
      if (op.kind === 'VOID') this.financialEffects.voids++;
    }
    this.results.set(op.request_id,observation);
    if (this.lostResponses.delete(op.kind)) throw new ProviderError('NETWORK_OUTCOME_UNKNOWN');
    return observation;
  }
  async observe(op:Operation) { return this.results.get(op.request_id) ?? null; }
}
