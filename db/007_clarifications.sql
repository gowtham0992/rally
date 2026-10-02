ALTER TABLE planning_members ADD COLUMN ai_questions smallint NOT NULL DEFAULT 0 CHECK(ai_questions BETWEEN 0 AND 2);
ALTER TABLE planning_members ADD COLUMN ai_calls smallint NOT NULL DEFAULT 0 CHECK(ai_calls BETWEEN 0 AND 4);
ALTER TABLE preference_revisions ADD COLUMN wording_bound jsonb;
CREATE TABLE planning_clarifications (
 id uuid PRIMARY KEY,
 member_id uuid NOT NULL REFERENCES planning_members(id),
 source_preference_id uuid NOT NULL,
 source_group_revision integer NOT NULL CHECK(source_group_revision>=0),
 status text NOT NULL CHECK(status IN ('RESERVED','DISPATCHED','READY','REVIEW','ANSWERED','DECLINED','STALE')),
 result jsonb, question_asked boolean NOT NULL DEFAULT false,
 resolved_preference_id uuid,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), started_at timestamptz,
 FOREIGN KEY(source_preference_id,member_id) REFERENCES preference_revisions(id,member_id),
 FOREIGN KEY(resolved_preference_id,member_id) REFERENCES preference_revisions(id,member_id),
 UNIQUE(member_id,source_preference_id,source_group_revision)
);
CREATE INDEX clarification_actor_rate ON planning_clarifications(created_at,member_id);
ALTER TABLE planning_clarifications ENABLE ROW LEVEL SECURITY;
-- No browser policies. Verified server commands return the owner's projection.
