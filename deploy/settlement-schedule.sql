-- Offline setup only; substitute the private 64-hex trigger key in memory.
-- Do not run through the runtime database role or commit the substituted SQL.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions;
-- Synchronous HTTP keeps the private header out of pg_net's shared queue.
SELECT pg_advisory_xact_lock(728121);
DO $check$
BEGIN
 IF EXISTS(SELECT 1 FROM (VALUES('anon'),('authenticated'),('rally_app')) AS roles(name)
  WHERE has_table_privilege(name,'vault.decrypted_secrets','SELECT')) THEN
  RAISE EXCEPTION 'Private scheduler secret storage is not isolated';
 END IF;
 IF (SELECT count(*) FROM vault.decrypted_secrets WHERE name='rally_settlement_trigger')>1 THEN
  RAISE EXCEPTION 'Duplicate scheduler secret';
 END IF;
 IF EXISTS(SELECT 1 FROM vault.decrypted_secrets WHERE name='rally_settlement_trigger' AND decrypted_secret<>'__RALLY_TRIGGER_KEY__') THEN
  RAISE EXCEPTION 'Existing scheduler secret does not match';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM vault.decrypted_secrets WHERE name='rally_settlement_trigger') THEN
  PERFORM vault.create_secret('__RALLY_TRIGGER_KEY__','rally_settlement_trigger','Private Rally sandbox settlement trigger');
 END IF;
END;
$check$;
CREATE OR REPLACE FUNCTION rally_private.request_settlement_tick() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $tick$
DECLARE http_status integer;
BEGIN
 DELETE FROM rally_private.request_limits WHERE (scope,subject_digest) IN
  (SELECT scope,subject_digest FROM rally_private.request_limits WHERE expires_at<=clock_timestamp()
   ORDER BY expires_at LIMIT 1000 FOR UPDATE SKIP LOCKED);
 -- No artificial keepalive when there is no payment/deadline/recovery work.
 IF NOT EXISTS(SELECT 1 FROM rally_private.offers WHERE state IN ('OPEN','SETTLING') OR cleanup IN ('REQUIRED','RUNNING','ACTION_REQUIRED')) THEN RETURN 0;END IF;
 -- The documented setter works under Supabase's restricted postgres role;
 -- function SET attributes cannot set these extension options there.
 IF NOT extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS','120000')
 OR NOT extensions.http_set_curlopt('CURLOPT_CONNECTTIMEOUT_MS','10000')
 OR NOT extensions.http_set_curlopt('CURLOPT_SSL_VERIFYPEER','1')
 OR NOT extensions.http_set_curlopt('CURLOPT_SSL_VERIFYHOST','2') THEN
  RAISE EXCEPTION 'Private settlement transport configuration failed';
 END IF;
 SELECT response.status INTO http_status FROM extensions.http((
  'POST','https://rally.gowthamsarveswaran.com/api/internal/settlement',
  ARRAY[('Authorization','Bearer '||(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='rally_settlement_trigger'))::extensions.http_header],
  'application/json','{}')::extensions.http_request) response;
 IF http_status<>200 THEN RAISE EXCEPTION 'Settlement tick HTTP status %',http_status;END IF;
 RETURN http_status;
END;
$tick$;
REVOKE ALL ON FUNCTION rally_private.request_settlement_tick() FROM PUBLIC,anon,authenticated,service_role,rally_app;
SELECT cron.schedule('rally-sandbox-settlement','* * * * *','SELECT rally_private.request_settlement_tick();');
COMMIT;
