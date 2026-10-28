-- Planning membership only. Immutable offer rosters and financial rows are untouched.
ALTER TABLE planning_members ADD COLUMN excluded boolean NOT NULL DEFAULT false;
ALTER TABLE collection_consent_events DROP CONSTRAINT collection_consent_events_action_check;
ALTER TABLE collection_consent_events ADD CONSTRAINT collection_consent_events_action_check
 CHECK(action IN ('OWNER_AGREE','NOMINEE_AGREE','REVOKE','ROSTER_INVALIDATED'));
ALTER TABLE request_limits DROP CONSTRAINT request_limits_scope_check;
ALTER TABLE request_limits ADD CONSTRAINT request_limits_scope_check CHECK(scope IN
 ('PUBLIC_API','EMAIL_GLOBAL','EMAIL_ACCOUNT','ACTOR_READ','ACTOR_WRITE','GROUP_CREATE','MODEL_GLOBAL','DEMO_ENTRY','DEMO_SWITCH','EMAIL_VERIFY_GLOBAL','EMAIL_VERIFY_ACCOUNT'));
