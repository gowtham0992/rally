-- Empty disposable schemas only; retained financial evidence is append-only.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM payment_reconciliation_evidence) THEN
  RAISE EXCEPTION 'Refuse to remove populated payment evidence' USING ERRCODE='23514';
 END IF;
END; $$;
DROP TABLE payment_reconciliation_evidence;
