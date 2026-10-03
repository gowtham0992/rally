-- Isolated empty test schemas only; never recycle a judge's payment history.
DO $$ BEGIN IF EXISTS(SELECT 1 FROM demo_workspaces) OR EXISTS(SELECT 1 FROM request_limits WHERE scope IN ('DEMO_ENTRY','DEMO_SWITCH')) THEN
 RAISE EXCEPTION 'Refuse to remove populated judge workspaces'; END IF; END $$;
ALTER TABLE planning_groups DROP COLUMN demo_workspace_id;
DROP TABLE demo_identities;
DROP TABLE demo_workspaces;
ALTER TABLE request_limits DROP CONSTRAINT request_limits_scope_check;
ALTER TABLE request_limits ADD CONSTRAINT request_limits_scope_check CHECK(scope IN
 ('PUBLIC_API','EMAIL_GLOBAL','EMAIL_ACCOUNT','ACTOR_READ','ACTOR_WRITE','GROUP_CREATE','MODEL_GLOBAL'));
