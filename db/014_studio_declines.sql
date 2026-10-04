-- Additive: prior runtime ignores these fields and treats a declined request as
-- stale because the same transaction returns its group to CLOSED.
ALTER TABLE merchant_requests ADD COLUMN decline_reason text,
 ADD COLUMN declined_at timestamptz;
ALTER TABLE merchant_requests DROP CONSTRAINT merchant_requests_state_check;
ALTER TABLE merchant_requests ADD CONSTRAINT merchant_requests_state_check
 CHECK(state IN ('PENDING','APPROVED','DECLINED'));
ALTER TABLE merchant_requests ADD CONSTRAINT merchant_requests_decline_check
 CHECK ((state='DECLINED' AND decline_reason IS NOT NULL AND decline_reason IN ('UNAVAILABLE','CANNOT_DELIVER','OTHER') AND declined_at IS NOT NULL AND approved_offer_id IS NULL)
 OR (state<>'DECLINED' AND decline_reason IS NULL AND declined_at IS NULL));
