import { createHash } from 'node:crypto';
import { z } from 'zod';
export const money = z.number().int().min(1).max(1000000);
export type Kind = 'CREATE_ORDER' | 'AUTHORIZE' | 'CAPTURE' | 'VOID' | 'REFUND';
export type OperationState = 'PLANNED' | 'DISPATCHED' | 'UNKNOWN' | 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'ACTION_REQUIRED';
export type ParticipantPayment='STUDIO_ACTION_NEEDED'|'REFUND_COMPLETED'|'REFUND_IN_PROGRESS'|'PAYMENT_COMPLETED'|'CHECKING_PAYMENT'|'AUTHORIZATION_CANCELED'|'AUTHORIZED_NOT_CONFIRMED'|'APPROVAL_NEEDED';
export type OfferState = 'OPEN' | 'SETTLING' | 'CONFIRMED' | 'EXPIRED' | 'WITHDRAWN' | 'SUPERSEDED' | 'ABORTED' | 'CANCELED';
export interface Offer {
  id: string; merchant_id: string; offer_hash: string; amount_minor: number; currency: 'USD';
  state: OfferState; cleanup: string; deadline: Date; reservation_end: Date; revision: number;
}
export interface Member {
  id: string; offer_id: string; user_id: string; ordinal: number; accepted_hash: string | null;
  accepted_at: Date | null; order_id: string | null; authorization_id: string | null;
  payer_id: string | null; qualified_at: Date | null;
}
export interface PaymentPayload {
  merchantId: string; amountMinor: number; currency: 'USD'; offerId: string; memberId: string;
  referenceId: string; parentId?: string;
}
export interface Operation {
  id: string; offer_id: string; member_id: string; kind: Kind; state: OperationState;
  request_id: string; payload: PaymentPayload; payload_hash: string;
  provider_id: string | null; provider_status: string | null; approval_url: string | null;
  dispatched_at: Date | null; retry_until: Date | null; lease_token: string | null; lease_until: Date | null;
}
export type Observation = {
  outcome: 'success' | 'failure' | 'pending'; id?: string; status: string;
  approvalUrl?: string; payerId?: string; expiresAt?: string; code?: string;
};
export interface PaymentProvider {
  mode: 'sandbox' | 'simulation';
  retentionMs(kind: Kind): number | null;
  execute(operation: Operation): Promise<Observation>;
  observe(operation: Operation): Promise<Observation | null>;
  verifyWebhook?(headers:Record<string,string>,event:unknown,raw?:Uint8Array):Promise<boolean>;
}
export class DomainError extends Error {
  constructor(public code: string, public status = 409) { super(code); }
}
export class ProviderError extends Error {
  constructor(public code: string, public definitive = false) { super(code); }
}
export function fingerprint(value: unknown): string {
  function canonical(input: unknown): unknown {
    if (Array.isArray(input)) return input.map(canonical);
    if (input && typeof input === 'object') return Object.fromEntries(Object.entries(input).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,canonical(item)]));
    return input;
  }
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}
export function decimal(minor: number): string { return `${Math.floor(minor / 100)}.${String(minor % 100).padStart(2,'0')}`; }
export function parseMinor(value: string): number {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) throw new ProviderError('INVALID_PROVIDER_AMOUNT');
  const [whole,fraction = ''] = value.split('.');
  return money.parse(Number(whole) * 100 + Number(fraction.padEnd(2,'0')));
}
