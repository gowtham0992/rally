-- Raw wording and model quotations expire; confirmed facts and financial history remain.
CREATE TABLE private_text_retention_policy (
 singleton boolean PRIMARY KEY CHECK(singleton),
 retention_days integer NOT NULL CHECK(retention_days BETWEEN 1 AND 365)
);
INSERT INTO private_text_retention_policy VALUES(true,30);
ALTER TABLE private_text_retention_policy ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private_text_retention_policy FROM PUBLIC;

ALTER TABLE preference_revisions ADD COLUMN private_text_expires_at timestamptz;
ALTER TABLE preference_revisions ADD COLUMN private_text_redacted_at timestamptz;
ALTER TABLE preference_revisions ADD CONSTRAINT private_text_redaction_clock CHECK (
 private_text_redacted_at IS NULL OR (private_text_expires_at IS NOT NULL AND private_text_redacted_at>=private_text_expires_at)
);
CREATE INDEX private_text_due ON preference_revisions(private_text_expires_at,member_id,id)
 WHERE private_text_expires_at IS NOT NULL AND private_text_redacted_at IS NULL;

CREATE FUNCTION close_private_text_round() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE days integer; closed_at timestamptz;
BEGIN
 IF NEW.state IN ('OFFER_ISSUED','ABANDONED') AND NEW.state IS DISTINCT FROM OLD.state THEN
  SELECT retention_days INTO STRICT days FROM private_text_retention_policy WHERE singleton;
  closed_at:=clock_timestamp();
  UPDATE preference_revisions p SET private_text_expires_at=closed_at+make_interval(days=>days)
   FROM planning_members m WHERE p.member_id=m.id AND m.group_id=NEW.id AND p.private_text_expires_at IS NULL;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER private_text_round_closed AFTER UPDATE OF state ON planning_groups
 FOR EACH ROW EXECUTE FUNCTION close_private_text_round();

-- Existing issued rounds have a durable closure event. Never infer closure from
-- preference creation time. For legacy abandonment without a dated event, begin
-- its countdown at migration time rather than manufacture an earlier deadline.
UPDATE preference_revisions p SET private_text_expires_at=coalesce(
 (SELECT min(e.created_at) FROM planning_events e WHERE e.group_id=m.group_id
  AND e.kind IN ('OFFER_OPENED','PLANNING_ABANDONED','DEMO_CATALOG_REPLACED') AND e.created_at>=p.created_at),
 CASE WHEN g.state='ABANDONED' THEN clock_timestamp() END
 )+make_interval(days=>policy.retention_days)
 FROM planning_members m JOIN planning_groups g ON g.id=m.group_id CROSS JOIN private_text_retention_policy policy
 WHERE p.member_id=m.id AND policy.singleton;

CREATE FUNCTION protect_private_text_clock() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.private_text_expires_at IS NOT NULL AND NEW.private_text_expires_at IS DISTINCT FROM OLD.private_text_expires_at
 OR OLD.private_text_redacted_at IS NOT NULL AND NEW.private_text_redacted_at IS DISTINCT FROM OLD.private_text_redacted_at
 OR OLD.private_text_redacted_at IS NOT NULL AND NEW.optional_text IS NOT NULL THEN
  RAISE EXCEPTION 'Private text retention cannot be extended or reversed' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER immutable_private_text_clock BEFORE UPDATE ON preference_revisions
 FOR EACH ROW EXECUTE FUNCTION protect_private_text_clock();

CREATE FUNCTION protect_expired_clarification_text() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
 IF NEW.result IS NOT NULL AND EXISTS(SELECT 1 FROM preference_revisions p WHERE p.id=NEW.source_preference_id
  AND (p.private_text_redacted_at IS NOT NULL OR p.private_text_expires_at<=clock_timestamp())) THEN
  RAISE EXCEPTION 'Expired private quotation cannot be stored' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER expired_clarification_text BEFORE INSERT OR UPDATE ON planning_clarifications
 FOR EACH ROW EXECUTE FUNCTION protect_expired_clarification_text();

CREATE FUNCTION purge_expired_private_text(batch_size integer DEFAULT 100) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path FROM CURRENT AS $$
DECLARE group_row record; ids uuid[]; total integer:=0; removed integer;
BEGIN
 IF batch_size IS NULL OR batch_size NOT BETWEEN 1 AND 1000 THEN
  RAISE EXCEPTION 'Invalid private text cleanup bound' USING ERRCODE='22023';
 END IF;
 -- Group-first locking matches all intake and clarification commands. Busy
 -- groups are skipped; no network call or payment operation belongs in this job.
 FOR group_row IN SELECT g.id,g.revision FROM planning_groups g WHERE EXISTS(
  SELECT 1 FROM planning_members m JOIN preference_revisions p ON p.member_id=m.id WHERE m.group_id=g.id
   AND p.private_text_expires_at<=clock_timestamp() AND p.private_text_redacted_at IS NULL)
  ORDER BY g.id LIMIT 25 FOR UPDATE OF g SKIP LOCKED
 LOOP
  SELECT array_agg(due.id) INTO ids FROM (SELECT p.id FROM preference_revisions p JOIN planning_members m ON m.id=p.member_id
   WHERE m.group_id=group_row.id AND p.private_text_expires_at<=clock_timestamp() AND p.private_text_redacted_at IS NULL
   ORDER BY p.private_text_expires_at,p.id LIMIT batch_size-total FOR UPDATE OF p SKIP LOCKED) due;
  IF ids IS NOT NULL THEN
   UPDATE planning_clarifications SET result=NULL,
    status=CASE WHEN status IN ('RESERVED','DISPATCHED','READY') THEN 'STALE' ELSE status END
    WHERE source_preference_id=ANY(ids);
   UPDATE preference_revisions SET optional_text=NULL,private_text_redacted_at=clock_timestamp() WHERE id=ANY(ids);
   GET DIAGNOSTICS removed=ROW_COUNT; total:=total+removed;
   INSERT INTO planning_events(group_id,revision,kind) VALUES(group_row.id,group_row.revision,'PRIVATE_TEXT_REDACTED');
  END IF;
  EXIT WHEN total>=batch_size;
 END LOOP;
 RETURN total;
END;
$$;
REVOKE ALL ON FUNCTION purge_expired_private_text(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION close_private_text_round(),protect_private_text_clock(),protect_expired_clarification_text() FROM PUBLIC;
-- Explicit pg_temp last prevents caller-created temporary tables from shadowing
-- private relations inside the elevated maintenance function or its triggers.
DO $paths$
DECLARE namespace text:=current_schema(); name text;
BEGIN
 FOREACH name IN ARRAY ARRAY['close_private_text_round()','protect_expired_clarification_text()','purge_expired_private_text(integer)'] LOOP
  EXECUTE format('ALTER FUNCTION %I.%s SET search_path TO pg_catalog,%I,pg_temp',namespace,name,namespace);
 END LOOP;
END;
$paths$;
