-- Pure database maintenance. Does not contact Render, PayPal, AI or email.
BEGIN;
SELECT pg_advisory_xact_lock(728122);
SET LOCAL ROLE rally_owner;
SET LOCAL search_path TO pg_catalog,rally_private,pg_temp;
UPDATE rally_private.private_text_retention_policy SET retention_days=__RETENTION_DAYS__ WHERE singleton;
RESET ROLE;
DO $check$
BEGIN
 IF NOT has_function_privilege('postgres','rally_private.purge_expired_private_text(integer)','EXECUTE')
 OR has_function_privilege('anon','rally_private.purge_expired_private_text(integer)','EXECUTE')
 OR has_function_privilege('authenticated','rally_private.purge_expired_private_text(integer)','EXECUTE')
 OR has_table_privilege('rally_app','rally_private.private_text_retention_policy','UPDATE') THEN
  RAISE EXCEPTION 'Private text maintenance permissions are not isolated';
 END IF;
END;
$check$;
SELECT cron.schedule('rally-private-text-retention','* * * * *','SELECT rally_private.purge_expired_private_text(100);');
COMMIT;
