CREATE TABLE planning_groups (
 id uuid PRIMARY KEY, organizer_id uuid NOT NULL, invite_digest text UNIQUE NOT NULL,
 target_size integer NOT NULL CHECK(target_size BETWEEN 1 AND 8), catalog jsonb NOT NULL,
 revision integer NOT NULL DEFAULT 0 CHECK(revision>=0),
 state text NOT NULL DEFAULT 'COLLECTING' CHECK(state IN ('COLLECTING','CLOSED','MERCHANT_REVIEW','OFFER_ISSUED','ABANDONED')),
 candidate jsonb, created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE planning_members (
 id uuid PRIMARY KEY, group_id uuid NOT NULL REFERENCES planning_groups(id), user_id uuid NOT NULL,
 display_name text NOT NULL CHECK(length(display_name) BETWEEN 1 AND 60), admitted boolean NOT NULL DEFAULT false,
 current_preference_id uuid, UNIQUE(group_id,user_id), UNIQUE(id,group_id)
);
CREATE TABLE preference_revisions (
 id uuid PRIMARY KEY, member_id uuid NOT NULL REFERENCES planning_members(id),
 confirmed jsonb NOT NULL, optional_text text CHECK(length(optional_text)<=2000),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), UNIQUE(id,member_id)
);
ALTER TABLE planning_members ADD CONSTRAINT own_current_preference FOREIGN KEY(current_preference_id,id) REFERENCES preference_revisions(id,member_id);
CREATE TABLE intake_commands (
 id uuid PRIMARY KEY, actor_id uuid NOT NULL, fingerprint text NOT NULL, result jsonb NOT NULL
);
CREATE TABLE planning_events (
 id bigserial PRIMARY KEY, group_id uuid NOT NULL REFERENCES planning_groups(id),
 revision integer NOT NULL, kind text NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE planning_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE planning_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE preference_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE intake_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE planning_events ENABLE ROW LEVEL SECURITY;
-- No browser policies: trusted server authenticates actors and projects explicit fields.
