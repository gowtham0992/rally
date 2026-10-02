import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { z } from 'zod';
import { transaction } from '../db.ts';
import { fingerprint, money } from './types.ts';

// Internal sandbox tooling only. Production offers will come from merchant approval
// of verified candidates; this function is never exposed on a booking route.
export async function createSandboxOffer(pool:pg.Pool,input:{ merchantId:string; count?:number; amountMinor?:number; resourceId?:string }) {
  const count = z.number().int().min(1).max(8).parse(input.count ?? 3);
  const amountMinor = money.parse(input.amountMinor ?? 4800);
  const merchantId = z.string().min(1).max(127).parse(input.merchantId);
  const id = randomUUID(), members = Array.from({length:count},(_,ordinal) => ({id:randomUUID(),userId:randomUUID(),ordinal}));
  const hash = fingerprint({id,merchantId,amountMinor,currency:'USD',members,activity:'Synthetic hand-building session'});
  await transaction(pool,async client => {
    await client.query(`INSERT INTO offers(id,merchant_id,offer_hash,amount_minor,state,deadline,reservation_end)
      VALUES($1,$2,$3,$4,'OPEN',clock_timestamp()+interval '2 hours',clock_timestamp()+interval '150 minutes')`,[id,merchantId,hash,amountMinor]);
    await client.query(`INSERT INTO reservations(offer_id,resource_id,occupied,state)
      VALUES($1,$2,tstzrange(clock_timestamp()+interval '2 days',clock_timestamp()+interval '2 days 2 hours','[)'),'HELD')`,[id,input.resourceId ?? `sandbox-${id}`]);
    for (const member of members) await client.query('INSERT INTO offer_members(id,offer_id,user_id,ordinal) VALUES($1,$2,$3,$4)',[member.id,id,member.userId,member.ordinal]);
  });
  return {id,hash,members};
}
