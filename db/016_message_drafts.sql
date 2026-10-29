-- Unconfirmed model work is separate from the active preference pointer.
CREATE TABLE intake_message_drafts (
 id uuid PRIMARY KEY, member_id uuid NOT NULL REFERENCES planning_members(id),
 source_preference_id uuid, text_value text CHECK(char_length(text_value) BETWEEN 1 AND 1500),
 status text NOT NULL CHECK(status IN ('RESERVED','DISPATCHED','READY','REVIEW','STALE','CONFIRMED')),
 result jsonb, created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
 expires_at timestamptz NOT NULL DEFAULT statement_timestamp()+interval '30 minutes', started_at timestamptz,
 FOREIGN KEY(source_preference_id,member_id) REFERENCES preference_revisions(id,member_id),
 CHECK(expires_at>created_at AND expires_at<=created_at+interval '30 minutes'),
 CHECK(text_value IS NOT NULL OR result IS NULL)
);
CREATE INDEX message_draft_owner ON intake_message_drafts(member_id,created_at DESC);
CREATE INDEX message_draft_due ON intake_message_drafts(expires_at) WHERE text_value IS NOT NULL;
ALTER TABLE intake_message_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON intake_message_drafts FROM PUBLIC;
CREATE FUNCTION protect_message_draft_clock() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.expires_at IS DISTINCT FROM OLD.expires_at OR NEW.created_at IS DISTINCT FROM OLD.created_at
 OR NEW.member_id IS DISTINCT FROM OLD.member_id OR NEW.source_preference_id IS DISTINCT FROM OLD.source_preference_id
 OR OLD.text_value IS NULL AND NEW.text_value IS NOT NULL
 OR NEW.text_value IS NOT NULL AND NEW.text_value IS DISTINCT FROM OLD.text_value
 OR NEW.result IS NOT NULL AND NEW.expires_at<=clock_timestamp() THEN
  RAISE EXCEPTION 'Draft identity and expiry cannot be replaced' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;$$;
CREATE TRIGGER message_draft_clock BEFORE UPDATE ON intake_message_drafts FOR EACH ROW EXECUTE FUNCTION protect_message_draft_clock();
CREATE FUNCTION purge_expired_message_drafts(batch_size integer DEFAULT 100) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path FROM CURRENT AS $$
DECLARE removed integer;
BEGIN
 IF batch_size IS NULL OR batch_size NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Invalid cleanup bound' USING ERRCODE='22023';END IF;
 UPDATE intake_message_drafts SET text_value=NULL,result=NULL,status=CASE WHEN status='CONFIRMED' THEN status ELSE 'STALE' END
 WHERE id IN (SELECT id FROM intake_message_drafts WHERE expires_at<=clock_timestamp() AND text_value IS NOT NULL
 ORDER BY expires_at,id LIMIT batch_size FOR UPDATE SKIP LOCKED);
 GET DIAGNOSTICS removed=ROW_COUNT;RETURN removed;
END;$$;
REVOKE ALL ON FUNCTION purge_expired_message_drafts(integer),protect_message_draft_clock() FROM PUBLIC;
DO $access$
DECLARE namespace text:=current_schema(); target text;
BEGIN
 EXECUTE format('ALTER FUNCTION %I.purge_expired_message_drafts(integer) SET search_path TO pg_catalog,%I,pg_temp',namespace,namespace);
 FOREACH target IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=target) THEN EXECUTE format('REVOKE ALL ON %I.intake_message_drafts FROM %I',namespace,target);END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='rally_app') THEN
  EXECUTE format('GRANT SELECT,INSERT,UPDATE ON %I.intake_message_drafts TO rally_app',namespace);
  EXECUTE format('CREATE POLICY rally_backend_drafts ON %I.intake_message_drafts FOR ALL TO rally_app USING(true) WITH CHECK(true)',namespace);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %I.purge_expired_message_drafts(integer) TO rally_app',namespace);
 END IF;
END;$access$;
-- Reuse the existing every-minute database retention job. No HTTP keep-alive,
-- new scheduler or payment work is introduced by draft cleanup.
DO $install_wrapper$ DECLARE namespace text:=current_schema();
BEGIN
 IF to_regprocedure('purge_expired_private_text(integer)') IS NOT NULL THEN
  ALTER FUNCTION purge_expired_private_text(integer) RENAME TO purge_expired_saved_private_text;
  EXECUTE $fn$CREATE FUNCTION purge_expired_private_text(batch_size integer DEFAULT 100) RETURNS integer
   LANGUAGE plpgsql SECURITY DEFINER SET search_path FROM CURRENT AS $body$
   DECLARE total integer;
   BEGIN
    total:=purge_expired_saved_private_text(batch_size);
    IF total<batch_size THEN total:=total+purge_expired_message_drafts(batch_size-total);END IF;
    RETURN total;
   END;$body$;$fn$;
  REVOKE ALL ON FUNCTION purge_expired_private_text(integer) FROM PUBLIC;
  EXECUTE format('ALTER FUNCTION %I.purge_expired_private_text(integer) SET search_path TO pg_catalog,%I,pg_temp',namespace,namespace);
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='rally_app') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %I.purge_expired_private_text(integer) TO rally_app',namespace);END IF;
 END IF;
END;$install_wrapper$;
DO $function_access$ DECLARE namespace text:=current_schema(); target text;
BEGIN
 FOREACH target IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=target) THEN
   EXECUTE format('REVOKE ALL ON FUNCTION %I.purge_expired_message_drafts(integer),%I.protect_message_draft_clock() FROM %I',namespace,namespace,target);
   IF to_regprocedure('purge_expired_private_text(integer)') IS NOT NULL THEN EXECUTE format('REVOKE ALL ON FUNCTION %I.purge_expired_private_text(integer) FROM %I',namespace,target);END IF;
  END IF;
 END LOOP;
END;$function_access$;
