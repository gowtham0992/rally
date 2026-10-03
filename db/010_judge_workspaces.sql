CREATE TABLE demo_workspaces (
 id uuid PRIMARY KEY, studio_id text UNIQUE NOT NULL, catalog jsonb NOT NULL,
 state text NOT NULL DEFAULT 'PROVISIONING' CHECK(state IN ('PROVISIONING','AVAILABLE','LEASED')),
 group_id uuid, lease_id uuid UNIQUE, lease_digest text UNIQUE,
 leased_at timestamptz, expires_at timestamptz,
 CHECK((state='LEASED' AND lease_id IS NOT NULL AND lease_digest IS NOT NULL AND leased_at IS NOT NULL AND expires_at IS NOT NULL)
  OR (state<>'LEASED' AND lease_id IS NULL AND lease_digest IS NULL AND leased_at IS NULL AND expires_at IS NULL)),
 CHECK(state='PROVISIONING' OR group_id IS NOT NULL),
 CHECK(lease_digest IS NULL OR lease_digest ~ '^[a-f0-9]{64}$'),
 CHECK(expires_at IS NULL OR expires_at>leased_at)
);
CREATE TABLE demo_identities (
 workspace_id uuid NOT NULL REFERENCES demo_workspaces(id),
 role text NOT NULL CHECK(role IN ('ORGANIZER','TRAVELER','COLLECTOR','FRIEND_ONE','FRIEND_TWO','FRIEND_THREE','STUDIO')),
 user_id uuid UNIQUE NOT NULL, email text UNIQUE NOT NULL, display_name text NOT NULL CHECK(length(display_name) BETWEEN 1 AND 60),
 PRIMARY KEY(workspace_id,role)
);
ALTER TABLE planning_groups ADD COLUMN demo_workspace_id uuid REFERENCES demo_workspaces(id);
ALTER TABLE demo_workspaces ADD FOREIGN KEY(group_id) REFERENCES planning_groups(id);
ALTER TABLE request_limits DROP CONSTRAINT request_limits_scope_check;
ALTER TABLE request_limits ADD CONSTRAINT request_limits_scope_check CHECK(scope IN
 ('PUBLIC_API','EMAIL_GLOBAL','EMAIL_ACCOUNT','ACTOR_READ','ACTOR_WRITE','GROUP_CREATE','MODEL_GLOBAL','DEMO_ENTRY','DEMO_SWITCH'));
ALTER TABLE demo_workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE demo_identities ENABLE ROW LEVEL SECURITY;
-- No browser policies. A judge lease never grants an application/merchant role.
