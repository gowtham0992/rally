ALTER TABLE payment_operations ADD COLUMN IF NOT EXISTS next_check_at timestamptz NOT NULL DEFAULT clock_timestamp();
