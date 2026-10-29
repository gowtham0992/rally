import type pg from 'pg';
import {fingerprint} from '../payments/types.ts';
export type Withdrawal={offerId:string;memberId:string;displayName:string;coming:boolean|null};
// The immutable command fingerprint binds the actor to this exact withdrawal.
// A WITHDRAWN offer alone never establishes who withdrew. This also supports
// existing offers without changing payment records or the payment engine.
export async function withdrawalForGroup(c:pg.Pool|pg.PoolClient,groupId:string):Promise<Withdrawal|null>{
 if(!(await c.query("SELECT to_regclass('offer_snapshots') IS NOT NULL AS present")).rows[0].present)return null;
 const offer=(await c.query(`SELECT o.id,o.offer_hash,o.state FROM offers o JOIN offer_snapshots s ON s.offer_id=o.id
  WHERE s.group_id=$1 ORDER BY o.opened_at DESC,o.id DESC LIMIT 1`,[groupId])).rows[0];
 if(offer?.state!=='WITHDRAWN')return null;
 const rows=(await c.query(`SELECT r.id,r.actor_id,r.payload_hash,m.id AS member_id,m.display_name
  FROM command_results r JOIN planning_members m ON m.user_id=r.actor_id AND m.group_id=$1
  JOIN offer_members om ON om.offer_id=$2 AND om.user_id=r.actor_id
  WHERE r.result->>'state'='WITHDRAWN'`,[groupId,offer.id])).rows;
 const actor=rows.find(r=>r.payload_hash===fingerprint({action:'WITHDRAW',commandId:r.id,actorId:r.actor_id,offerId:offer.id,offerHash:offer.offer_hash}));
 if(!actor)return null;
 const answer=(await c.query(`SELECT result->'coming' AS coming FROM intake_commands
  WHERE actor_id=$1 AND result->>'kind'='PARTICIPATION_CONFIRMED' AND result->>'offerId'=$2
  AND result->>'memberId'=$3 ORDER BY (result->>'revision')::integer DESC,id DESC LIMIT 1`,[actor.actor_id,offer.id,actor.member_id])).rows[0];
 return {offerId:offer.id,memberId:actor.member_id,displayName:actor.display_name,coming:typeof answer?.coming==='boolean'?answer.coming:null};
}
