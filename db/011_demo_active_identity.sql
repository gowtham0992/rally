ALTER TABLE demo_identities ADD CONSTRAINT demo_identity_workspace_user UNIQUE(workspace_id,user_id);
ALTER TABLE demo_workspaces ADD COLUMN active_user_id uuid;
UPDATE demo_workspaces w SET active_user_id=d.user_id FROM demo_identities d
 WHERE w.state='LEASED' AND d.workspace_id=w.id AND d.role='ORGANIZER';
ALTER TABLE demo_workspaces ADD CONSTRAINT demo_active_identity FOREIGN KEY(id,active_user_id) REFERENCES demo_identities(workspace_id,user_id);
ALTER TABLE demo_workspaces ADD CONSTRAINT demo_active_lease CHECK((state='LEASED')=(active_user_id IS NOT NULL));
