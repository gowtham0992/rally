-- Studio observations are audit evidence, never a payment-state override.
CREATE TABLE payment_reconciliation_evidence (
 id uuid PRIMARY KEY REFERENCES intake_commands(id) DEFERRABLE INITIALLY DEFERRED,
 operation_id uuid NOT NULL REFERENCES payment_operations(id),
 recorded_by uuid NOT NULL,
 source text NOT NULL CHECK(source IN ('TRANSACTION','SUPPORT_CASE')),
 reference text NOT NULL CHECK(reference ~ '^[A-Z0-9][A-Z0-9-]{2,63}$'),
 reported_outcome text NOT NULL CHECK(reported_outcome IN ('COMPLETED','PENDING','FAILED','UNRESOLVED')),
 operation_state_at_recording text NOT NULL CHECK(operation_state_at_recording IN ('UNKNOWN','PENDING','ACTION_REQUIRED','FAILED')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(operation_id,source,reference,reported_outcome)
);
CREATE INDEX payment_evidence_history ON payment_reconciliation_evidence(operation_id,created_at DESC,id DESC);
ALTER TABLE payment_reconciliation_evidence ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER immutable_payment_evidence BEFORE UPDATE OR DELETE ON payment_reconciliation_evidence
 FOR EACH ROW EXECUTE FUNCTION reject_frozen_record_change();
