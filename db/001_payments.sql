CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY);

CREATE TABLE offers (
  id uuid PRIMARY KEY, merchant_id text NOT NULL, offer_hash text NOT NULL,
  amount_minor integer NOT NULL CHECK (amount_minor > 0 AND amount_minor <= 1000000),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  state text NOT NULL CHECK (state IN ('OPEN','SETTLING','CONFIRMED','EXPIRED','WITHDRAWN','SUPERSEDED','ABORTED')),
  cleanup text NOT NULL DEFAULT 'NOT_REQUIRED' CHECK (cleanup IN ('NOT_REQUIRED','REQUIRED','RUNNING','COMPLETE','ACTION_REQUIRED')),
  revision integer NOT NULL DEFAULT 1,
  opened_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  deadline timestamptz NOT NULL, reservation_end timestamptz NOT NULL,
  CHECK (reservation_end > deadline AND deadline > opened_at)
);
CREATE TABLE reservations (
  offer_id uuid PRIMARY KEY REFERENCES offers(id), resource_id text NOT NULL,
  occupied tstzrange NOT NULL CHECK (NOT isempty(occupied) AND NOT lower_inf(occupied) AND NOT upper_inf(occupied)),
  state text NOT NULL CHECK (state IN ('HELD','BOOKED','RELEASED','CANCELED','COMPLETED')),
  EXCLUDE USING gist (resource_id WITH =, occupied WITH &&) WHERE (state IN ('HELD','BOOKED'))
);
CREATE TABLE offer_members (
  id uuid PRIMARY KEY, offer_id uuid NOT NULL REFERENCES offers(id), user_id uuid NOT NULL,
  ordinal integer NOT NULL CHECK (ordinal BETWEEN 0 AND 7),
  accepted_hash text, accepted_at timestamptz,
  order_id text UNIQUE, authorization_id text UNIQUE, payer_id text,
  qualified_at timestamptz,
  UNIQUE (offer_id,user_id), UNIQUE (offer_id,ordinal),
  CHECK ((accepted_hash IS NULL) = (accepted_at IS NULL))
);
-- Retain duplicate-buyer authorization evidence for cleanup; only independently
-- funded, qualified members may contribute to settlement.
CREATE UNIQUE INDEX independent_qualified_payers ON offer_members(offer_id,payer_id) WHERE qualified_at IS NOT NULL;
CREATE TABLE payment_operations (
  id uuid PRIMARY KEY, offer_id uuid NOT NULL REFERENCES offers(id), member_id uuid NOT NULL REFERENCES offer_members(id),
  kind text NOT NULL CHECK (kind IN ('CREATE_ORDER','AUTHORIZE','CAPTURE','VOID','REFUND')),
  state text NOT NULL CHECK (state IN ('PLANNED','DISPATCHED','UNKNOWN','PENDING','SUCCEEDED','FAILED','ACTION_REQUIRED')),
  request_id uuid NOT NULL UNIQUE, payload jsonb NOT NULL, payload_hash text NOT NULL,
  provider_id text, provider_status text, safe_code text, approval_url text,
  dispatched_at timestamptz, retry_until timestamptz,
  lease_token uuid, lease_until timestamptz, attempts integer NOT NULL DEFAULT 0,
  next_check_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (member_id,kind)
);
CREATE TABLE command_results (
  id uuid PRIMARY KEY, actor_id uuid NOT NULL, payload_hash text NOT NULL, result jsonb NOT NULL
);
CREATE TABLE payment_events (
  seq bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, offer_id uuid NOT NULL REFERENCES offers(id),
  event_type text NOT NULL, operation_id uuid, state text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE provider_webhooks (
  event_id text PRIMARY KEY, event_type text NOT NULL, resource_id text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT clock_timestamp(), processed_at timestamptz
);
CREATE INDEX payment_work ON payment_operations(state,lease_until);
CREATE INDEX offer_work ON offers(state,reservation_end);
CREATE INDEX payment_events_offer ON payment_events(offer_id,seq);

-- Browser clients must never read these financial tables directly. Later authenticated
-- application routes expose owner-scoped projections. Service role bypass is server-only.
ALTER TABLE offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE offer_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE command_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_webhooks ENABLE ROW LEVEL SECURITY;
