CREATE TABLE collection_consents (
 preference_id uuid PRIMARY KEY REFERENCES preference_revisions(id),
 owner_member_id uuid NOT NULL REFERENCES planning_members(id),
 nominee_member_id uuid NOT NULL REFERENCES planning_members(id),
 owner_agreed boolean NOT NULL DEFAULT false,
 nominee_agreed boolean NOT NULL DEFAULT false,
 disclosure_agreed boolean NOT NULL DEFAULT false,
 revoked boolean NOT NULL DEFAULT false,
 CHECK(owner_member_id<>nominee_member_id),
 FOREIGN KEY(preference_id,owner_member_id) REFERENCES preference_revisions(id,member_id)
);
CREATE TABLE collection_consent_events (
 id bigserial PRIMARY KEY, preference_id uuid NOT NULL REFERENCES collection_consents(preference_id),
 actor_member_id uuid NOT NULL REFERENCES planning_members(id),
 action text NOT NULL CHECK(action IN ('OWNER_AGREE','NOMINEE_AGREE','REVOKE')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE collection_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_consent_events ENABLE ROW LEVEL SECURITY;
