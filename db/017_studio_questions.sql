-- Guest-authored questions are shared only with the configured studio operator.
-- No names, original notes, private form values or financial authority are stored here.
CREATE TABLE studio_questions (
 id uuid PRIMARY KEY, group_id uuid NOT NULL REFERENCES planning_groups(id),
 member_id uuid NOT NULL, source_preference_id uuid NOT NULL,
 studio_id text NOT NULL, catalog_version_id text NOT NULL,
 offering_id text NOT NULL, slot_id text NOT NULL,
 question text CHECK(char_length(question) BETWEEN 1 AND 600),
 disclosure_agreed boolean NOT NULL CHECK(disclosure_agreed),
 decision text CHECK(decision IN ('CAN_ACCOMMODATE','CANNOT_ACCOMMODATE','NEEDS_DISCUSSION')),
 reply text CHECK(char_length(reply) BETWEEN 1 AND 1000),
 answered_at timestamptz, accepted_preference_id uuid UNIQUE,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '30 days',
 FOREIGN KEY(member_id,group_id) REFERENCES planning_members(id,group_id),
 FOREIGN KEY(source_preference_id,member_id) REFERENCES preference_revisions(id,member_id),
 FOREIGN KEY(accepted_preference_id,member_id) REFERENCES preference_revisions(id,member_id),
 FOREIGN KEY(studio_id,catalog_version_id) REFERENCES merchant_catalog_versions(studio_id,version_id),
 UNIQUE(member_id,source_preference_id),
 CHECK(expires_at>created_at AND expires_at<=created_at+interval '30 days 1 second'),
 CHECK((decision IS NULL)=(answered_at IS NULL)),
 CHECK(reply IS NULL OR decision IS NOT NULL),
 CHECK(accepted_preference_id IS NULL OR decision='CAN_ACCOMMODATE'),
 CHECK(question IS NOT NULL OR reply IS NULL)
);
CREATE INDEX studio_questions_inbox ON studio_questions(studio_id,created_at DESC,id DESC);
CREATE INDEX studio_questions_due ON studio_questions(expires_at) WHERE question IS NOT NULL;
ALTER TABLE studio_questions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON studio_questions FROM PUBLIC;
CREATE FUNCTION protect_studio_question() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW.id,NEW.group_id,NEW.member_id,NEW.source_preference_id,NEW.studio_id,NEW.catalog_version_id,NEW.offering_id,NEW.slot_id,NEW.disclosure_agreed,NEW.created_at,NEW.expires_at)
 IS DISTINCT FROM (OLD.id,OLD.group_id,OLD.member_id,OLD.source_preference_id,OLD.studio_id,OLD.catalog_version_id,OLD.offering_id,OLD.slot_id,OLD.disclosure_agreed,OLD.created_at,OLD.expires_at)
 OR NEW.question IS NOT NULL AND NEW.question IS DISTINCT FROM OLD.question
 OR OLD.decision IS NOT NULL AND (NEW.decision,NEW.answered_at) IS DISTINCT FROM (OLD.decision,OLD.answered_at)
 OR OLD.reply IS NOT NULL AND NEW.reply IS NOT NULL AND NEW.reply IS DISTINCT FROM OLD.reply
 OR OLD.reply IS NOT NULL AND NEW.reply IS NULL AND OLD.expires_at>clock_timestamp()
 OR OLD.reply IS NULL AND OLD.decision IS NOT NULL AND NEW.reply IS NOT NULL
 OR OLD.accepted_preference_id IS NOT NULL AND NEW.accepted_preference_id IS DISTINCT FROM OLD.accepted_preference_id
 OR NEW.expires_at<=clock_timestamp() AND (NEW.question IS NOT NULL OR NEW.reply IS NOT NULL)
 OR NEW.question IS NULL AND OLD.question IS NOT NULL AND OLD.expires_at>clock_timestamp() THEN
  RAISE EXCEPTION 'Studio question identity, answer and retention are immutable; expired text stays redacted' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;$$;
CREATE TRIGGER studio_question_identity BEFORE UPDATE ON studio_questions FOR EACH ROW EXECUTE FUNCTION protect_studio_question();
CREATE TRIGGER studio_question_history BEFORE DELETE ON studio_questions FOR EACH ROW EXECUTE FUNCTION reject_frozen_record_change();
CREATE TABLE studio_question_drafts (
 id uuid PRIMARY KEY,member_id uuid NOT NULL REFERENCES planning_members(id),source_preference_id uuid NOT NULL,
 offering_id text NOT NULL,slot_id text NOT NULL,
 status text NOT NULL CHECK(status IN ('RESERVED','DISPATCHED','READY','REVIEW','STALE')),
 result jsonb,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '30 minutes',
 FOREIGN KEY(source_preference_id,member_id) REFERENCES preference_revisions(id,member_id),
 CHECK(expires_at>created_at AND expires_at<=created_at+interval '30 minutes 1 second')
);
CREATE INDEX studio_question_drafts_owner ON studio_question_drafts(member_id,created_at DESC);
ALTER TABLE studio_question_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON studio_question_drafts FROM PUBLIC;
CREATE FUNCTION protect_studio_question_draft() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW.id,NEW.member_id,NEW.source_preference_id,NEW.offering_id,NEW.slot_id,NEW.created_at,NEW.expires_at)
 IS DISTINCT FROM (OLD.id,OLD.member_id,OLD.source_preference_id,OLD.offering_id,OLD.slot_id,OLD.created_at,OLD.expires_at)
 OR NEW.result IS NOT NULL AND (NEW.expires_at<=clock_timestamp() OR OLD.status IN ('READY','REVIEW','STALE')) THEN
  RAISE EXCEPTION 'Question draft identity and expiry are immutable' USING ERRCODE='23514';
 END IF;RETURN NEW;
END;$$;
CREATE TRIGGER studio_question_draft_identity BEFORE UPDATE ON studio_question_drafts FOR EACH ROW EXECUTE FUNCTION protect_studio_question_draft();
CREATE FUNCTION purge_expired_studio_questions(batch_size integer DEFAULT 100) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path FROM CURRENT AS $$
DECLARE removed integer; drafts_removed integer;
BEGIN
 IF batch_size IS NULL OR batch_size NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Invalid cleanup bound' USING ERRCODE='22023';END IF;
 UPDATE studio_questions SET question=NULL,reply=NULL WHERE id IN (
  SELECT id FROM studio_questions WHERE expires_at<=clock_timestamp() AND question IS NOT NULL
  ORDER BY expires_at,id LIMIT batch_size FOR UPDATE SKIP LOCKED);
 GET DIAGNOSTICS removed=ROW_COUNT;
 IF removed<batch_size THEN
  UPDATE studio_question_drafts SET result=NULL,status='STALE' WHERE id IN (
   SELECT id FROM studio_question_drafts WHERE expires_at<=clock_timestamp() AND status<>'STALE'
   ORDER BY expires_at,id LIMIT batch_size-removed FOR UPDATE SKIP LOCKED);
  GET DIAGNOSTICS drafts_removed=ROW_COUNT;removed:=removed+drafts_removed;
 END IF;RETURN removed;
END;$$;
-- Reuse the existing bounded database retention job; no new scheduler.
DO $wrapper$ BEGIN
 IF to_regprocedure('purge_expired_private_text(integer)') IS NOT NULL THEN
  ALTER FUNCTION purge_expired_private_text(integer) RENAME TO purge_expired_pre_question_text;
  EXECUTE $fn$CREATE FUNCTION purge_expired_private_text(batch_size integer DEFAULT 100) RETURNS integer
   LANGUAGE plpgsql SECURITY DEFINER SET search_path FROM CURRENT AS $body$
   DECLARE removed integer;
   BEGIN
    removed:=purge_expired_pre_question_text(batch_size);
    IF removed<batch_size THEN removed:=removed+purge_expired_studio_questions(batch_size-removed);END IF;
    RETURN removed;
   END;$body$;$fn$;
 END IF;
END;$wrapper$;
REVOKE ALL ON FUNCTION protect_studio_question(),protect_studio_question_draft(),purge_expired_studio_questions(integer) FROM PUBLIC;
DO $access$ DECLARE namespace text:=current_schema(); target text; fn text;
BEGIN
 FOREACH fn IN ARRAY ARRAY['purge_expired_studio_questions(integer)','purge_expired_private_text(integer)'] LOOP
  IF to_regprocedure(fn) IS NOT NULL THEN
   EXECUTE format('ALTER FUNCTION %I.%s SET search_path TO pg_catalog,%I,pg_temp',namespace,fn,namespace);
   EXECUTE format('REVOKE ALL ON FUNCTION %I.%s FROM PUBLIC',namespace,fn);
  END IF;
 END LOOP;
 FOREACH target IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=target) THEN
   EXECUTE format('REVOKE ALL ON %I.studio_questions FROM %I',namespace,target);
   EXECUTE format('REVOKE ALL ON %I.studio_question_drafts FROM %I',namespace,target);
   EXECUTE format('REVOKE ALL ON FUNCTION %I.protect_studio_question(),%I.protect_studio_question_draft(),%I.purge_expired_studio_questions(integer) FROM %I',namespace,namespace,namespace,target);
   IF to_regprocedure('purge_expired_private_text(integer)') IS NOT NULL THEN EXECUTE format('REVOKE ALL ON FUNCTION %I.purge_expired_private_text(integer) FROM %I',namespace,target);END IF;
  END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='rally_app') THEN
  EXECUTE format('GRANT SELECT,INSERT,UPDATE ON %I.studio_questions TO rally_app',namespace);
  EXECUTE format('CREATE POLICY rally_backend_questions ON %I.studio_questions FOR ALL TO rally_app USING(true) WITH CHECK(true)',namespace);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE ON %I.studio_question_drafts TO rally_app',namespace);
  EXECUTE format('CREATE POLICY rally_backend_question_drafts ON %I.studio_question_drafts FOR ALL TO rally_app USING(true) WITH CHECK(true)',namespace);
  IF to_regprocedure('purge_expired_private_text(integer)') IS NOT NULL THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %I.purge_expired_private_text(integer) TO rally_app',namespace);END IF;
 END IF;
END;$access$;
