import type pg from 'pg';
export async function dailyAiCalls(c:pg.PoolClient,userId:string){
 const old=Number((await c.query("SELECT count(*) FROM planning_clarifications q JOIN planning_members m ON m.id=q.member_id WHERE m.user_id=$1 AND q.created_at>clock_timestamp()-interval '24 hours'",[userId])).rows[0].count);
 const exists=(await c.query("SELECT to_regclass('intake_message_drafts') IS NOT NULL AS available")).rows[0].available;
 const drafts=exists?Number((await c.query("SELECT count(*) FROM intake_message_drafts d JOIN planning_members m ON m.id=d.member_id WHERE m.user_id=$1 AND d.created_at>clock_timestamp()-interval '24 hours'",[userId])).rows[0].count):0;
 const questionsPresent=(await c.query("SELECT to_regclass('studio_question_drafts') IS NOT NULL AS available")).rows[0].available;
 const questions=questionsPresent?Number((await c.query("SELECT count(*) FROM studio_question_drafts d JOIN planning_members m ON m.id=d.member_id WHERE m.user_id=$1 AND d.created_at>clock_timestamp()-interval '24 hours'",[userId])).rows[0].count):0;
 return old+drafts+questions;
}
