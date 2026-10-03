DO $$ BEGIN IF EXISTS(SELECT 1 FROM demo_workspaces WHERE state='LEASED') THEN RAISE EXCEPTION 'Refuse to remove active leased identity binding';END IF;END $$;
ALTER TABLE demo_workspaces DROP CONSTRAINT demo_active_lease;
ALTER TABLE demo_workspaces DROP CONSTRAINT demo_active_identity;
ALTER TABLE demo_workspaces DROP COLUMN active_user_id;
ALTER TABLE demo_identities DROP CONSTRAINT demo_identity_workspace_user;
