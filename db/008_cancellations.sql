-- Add a terminal cancellation state without changing frozen booking terms.
ALTER TABLE offers DROP CONSTRAINT offers_state_check;
ALTER TABLE offers ADD CONSTRAINT offers_state_check CHECK
 (state IN ('OPEN','SETTLING','CONFIRMED','EXPIRED','WITHDRAWN','SUPERSEDED','ABORTED','CANCELED'));

-- One request per participant/offer. It requests studio action, never refunds
-- or changes the booking by itself. Actor ownership is enforced by the server.
CREATE TABLE cancellation_requests (
 member_id uuid PRIMARY KEY REFERENCES offer_members(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE cancellation_requests ENABLE ROW LEVEL SECURITY;
