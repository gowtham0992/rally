import type pg from 'pg';
import {z} from 'zod';
// Database time, closure markers and locked rows decide what expires. Callers
// cannot supply a timestamp, group, text or financial outcome.
export async function purgeExpiredPrivateText(pool:pg.Pool,batchSize=100){
 z.number().int().min(1).max(1000).parse(batchSize);
 const result=await pool.query('SELECT purge_expired_private_text($1) AS removed',[batchSize]);
 return result.rows[0].removed as number;
}
