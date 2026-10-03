import {createHash,timingSafeEqual} from 'node:crypto';
import type pg from 'pg';
import {z} from 'zod';
import {purgeRequestLimits} from '../web/rate-limits.ts';
import {purgeExpiredPrivateText} from '../intake/retention.ts';
import {WebError} from '../web/security.ts';

export function authorizeSettlementTrigger(request:Request,mode=process.env.RALLY_SETTLEMENT_MODE,key=process.env.RALLY_SETTLEMENT_TRIGGER_KEY){
 if(mode!=='scheduled'||!key||!/^[a-f0-9]{64}$/.test(key))throw new WebError('SETTLEMENT_UNAVAILABLE',503);
 const received=request.headers.get('authorization')??'';
 if(received.length>256||!timingSafeEqual(createHash('sha256').update(received).digest(),createHash('sha256').update(`Bearer ${key}`).digest()))throw new WebError('REQUEST_NOT_ALLOWED',403);
}
export async function scheduledSettlement(pool:pg.Pool,engine:{step(id:string):Promise<boolean>},options:{maxSteps?:number;budgetMs?:number;now?:()=>number}={}){
 const maxSteps=z.number().int().min(1).max(32).parse(options.maxSteps??16),budgetMs=z.number().int().min(1).max(30000).parse(options.budgetMs??20000),now=options.now??Date.now;
 const lock=await pool.connect();let acquired=false;
 try{
  acquired=(await lock.query('SELECT pg_try_advisory_lock(728120) AS acquired')).rows[0].acquired;
  if(!acquired)return {state:'BUSY' as const,steps:0,failures:0};
  const started=now();let steps=0,failures=0;
  await purgeRequestLimits(pool);
  await purgeExpiredPrivateText(pool);
  // Skip open offers with no due work. Future unresolved operations retain their
  // original retry timestamps; the scheduler is not permission to dispatch early.
  const offers=(await pool.query(`SELECT o.id FROM offers o WHERE
   (o.state='OPEN' AND o.deadline<=clock_timestamp()) OR o.state='SETTLING'
   OR (o.cleanup IN ('REQUIRED','RUNNING','ACTION_REQUIRED'))
   OR EXISTS(SELECT 1 FROM payment_operations p WHERE p.offer_id=o.id
    AND p.state IN ('PLANNED','DISPATCHED','UNKNOWN','PENDING','ACTION_REQUIRED')
    AND p.next_check_at<=clock_timestamp() AND (p.lease_until IS NULL OR p.lease_until<clock_timestamp()))
   ORDER BY coalesce((SELECT min(p.next_check_at) FROM payment_operations p WHERE p.offer_id=o.id
    AND p.state IN ('PLANNED','DISPATCHED','UNKNOWN','PENDING','ACTION_REQUIRED')),o.deadline),o.id LIMIT 100`)).rows;
  // Check budget before dispatch, never abandon an in-flight provider operation
  // merely to manufacture a successful scheduler response. Existing leases and
  // reconciliation handle provider timeouts and process termination.
  for(const offer of offers){
   if(steps>=maxSteps||now()-started>=budgetMs)break;
   try{if(await engine.step(offer.id))steps++;}catch{failures++;}
  }
  return {state:steps||offers.length?'PROCESSED' as const:'IDLE' as const,steps,failures};
 }finally{try{if(acquired)await lock.query('SELECT pg_advisory_unlock(728120)');}finally{lock.release();}}
}
