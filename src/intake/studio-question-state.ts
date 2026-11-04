import type {PoolClient} from 'pg';
export type StudioQuestionExpiry='ANSWER_EXPIRED'|'QUESTION_EXPIRED';
export async function studioQuestionExpiries(c:PoolClient,memberIds:string[]){
 if(!memberIds.length||!(await c.query("SELECT to_regclass('studio_questions') IS NOT NULL AS present")).rows[0].present)return new Map<string,StudioQuestionExpiry>();
 // Metadata only. Expired question/reply text must never enter the projection.
 const rows=(await c.query(`SELECT q.member_id,q.decision IS NOT NULL AS answered FROM studio_questions q
  JOIN planning_members m ON m.id=q.member_id AND (m.current_preference_id=q.source_preference_id OR m.current_preference_id=q.accepted_preference_id)
  JOIN planning_groups g ON g.id=q.group_id WHERE q.member_id=ANY($1::uuid[]) AND q.expires_at<=clock_timestamp()
  AND q.studio_id=g.catalog->>'studioId' AND q.catalog_version_id=g.catalog->>'versionId'`,[memberIds])).rows;
 return new Map<string,StudioQuestionExpiry>(rows.map(r=>[r.member_id,r.answered?'ANSWER_EXPIRED':'QUESTION_EXPIRED']));
}
export async function studioQuestionStates(c:PoolClient,memberIds:string[]){
 if(!memberIds.length||!(await c.query("SELECT to_regclass('studio_questions') IS NOT NULL AS present")).rows[0].present)return new Map<string,'WAITING'|'ANSWERED'>();
 const rows=(await c.query(`SELECT q.member_id,q.decision FROM studio_questions q JOIN planning_members m ON m.id=q.member_id AND m.current_preference_id=q.source_preference_id JOIN planning_groups g ON g.id=q.group_id
  WHERE q.member_id=ANY($1::uuid[]) AND q.expires_at>clock_timestamp() AND q.question IS NOT NULL AND q.studio_id=g.catalog->>'studioId' AND q.catalog_version_id=g.catalog->>'versionId'`,[memberIds])).rows;
 return new Map(rows.map(r=>[r.member_id as string,r.decision?'ANSWERED' as const:'WAITING' as const]));
}
