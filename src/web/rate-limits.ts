import {createHmac} from 'node:crypto';
import type pg from 'pg';
import {WebError} from './security.ts';

export const requestPolicies={
 PUBLIC_API:{limit:6000,seconds:3600},
 EMAIL_GLOBAL:{limit:30,seconds:3600},
 EMAIL_ACCOUNT:{limit:3,seconds:900},
 ACTOR_READ:{limit:240,seconds:60},
 ACTOR_WRITE:{limit:60,seconds:60},
 GROUP_CREATE:{limit:10,seconds:86400},
 MODEL_GLOBAL:{limit:72,seconds:86400},
} as const;
export type RequestScope=keyof typeof requestPolicies;
export class RateLimitError extends WebError {
 constructor(public retryAfter:number){super('REQUEST_LIMIT',429);}
}
export function rateLimitKey(value=process.env.RALLY_RATE_LIMIT_KEY){
 if(!value||!/^[a-f0-9]{64}$/.test(value))throw new WebError('SETUP_REQUIRED',503);
 return value;
}
export function subjectDigest(key:string,scope:RequestScope,subject:string){
 return createHmac('sha256',rateLimitKey(key)).update(scope).update('\0').update(subject).digest('hex');
}
export class RequestLimiter {
 constructor(private pool:pg.Pool,private key:string){rateLimitKey(key);}
 async reserve(scope:RequestScope,subject:string){
  const policy=requestPolicies[scope],digest=subjectDigest(this.key,scope,subject);
  // One atomic upsert: concurrent processes cannot each spend the last slot.
  // Denials do not increment hits or extend the window. Use database time.
  const result=await this.pool.query(`INSERT INTO request_limits(scope,subject_digest,hits,expires_at)
   VALUES($1,$2,1,statement_timestamp()+$3*interval '1 second')
   ON CONFLICT(scope,subject_digest) DO UPDATE SET
    hits=CASE WHEN request_limits.expires_at<=statement_timestamp() THEN 1 ELSE request_limits.hits+1 END,
    expires_at=CASE WHEN request_limits.expires_at<=statement_timestamp() THEN statement_timestamp()+$3*interval '1 second' ELSE request_limits.expires_at END
   WHERE request_limits.expires_at<=statement_timestamp() OR request_limits.hits<$4
   RETURNING expires_at`,[scope,digest,policy.seconds,policy.limit]);
  if(result.rowCount)return;
  const row=(await this.pool.query('SELECT greatest(1,ceil(extract(epoch FROM expires_at-clock_timestamp())))::int AS retry FROM request_limits WHERE scope=$1 AND subject_digest=$2',[scope,digest])).rows[0];
  throw new RateLimitError(row?.retry??1);
 }
}
export async function purgeRequestLimits(pool:pg.Pool){
 // Keep each worker maintenance step bounded, including during catch-up.
 return (await pool.query(`DELETE FROM request_limits WHERE (scope,subject_digest) IN
  (SELECT scope,subject_digest FROM request_limits WHERE expires_at<=clock_timestamp()
   ORDER BY expires_at LIMIT 1000 FOR UPDATE SKIP LOCKED)`)).rowCount??0;
}
