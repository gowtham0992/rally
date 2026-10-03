-- Disposable empty schemas only. Deleted wording cannot be recovered.
-- A populated runtime rollback retains the additive privacy schema and job.
DO $guard$
DECLARE scheduled boolean;
BEGIN
 IF EXISTS(SELECT 1 FROM planning_groups) OR EXISTS(SELECT 1 FROM preference_revisions)
 OR EXISTS(SELECT 1 FROM planning_clarifications) THEN
  RAISE EXCEPTION 'Refuse to remove populated private text retention' USING ERRCODE='23514';
 END IF;
 IF to_regclass('cron.job') IS NOT NULL THEN
  EXECUTE 'SELECT EXISTS(SELECT 1 FROM cron.job WHERE jobname=''rally-private-text-retention'' AND active)' INTO scheduled;
  IF scheduled THEN
   RAISE EXCEPTION 'Disable private text cleanup before removing its function' USING ERRCODE='23514';
  END IF;
 END IF;
END;
$guard$;
DROP TRIGGER private_text_round_closed ON planning_groups;
DROP TRIGGER immutable_private_text_clock ON preference_revisions;
DROP TRIGGER expired_clarification_text ON planning_clarifications;
DROP FUNCTION close_private_text_round(),protect_private_text_clock(),protect_expired_clarification_text(),purge_expired_private_text(integer);
ALTER TABLE preference_revisions DROP CONSTRAINT private_text_redaction_clock;
ALTER TABLE preference_revisions DROP COLUMN private_text_expires_at,DROP COLUMN private_text_redacted_at;
DROP TABLE private_text_retention_policy;
