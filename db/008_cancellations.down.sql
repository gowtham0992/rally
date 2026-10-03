-- Refuse a rollback that would erase cancellation history or terminal state.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM offers WHERE state='CANCELED') OR EXISTS(SELECT 1 FROM cancellation_requests) THEN
  RAISE EXCEPTION 'Cancellation history requires forward migration' USING ERRCODE='23514';
 END IF;
END $$;
DROP TABLE cancellation_requests;
ALTER TABLE offers DROP CONSTRAINT offers_state_check;
ALTER TABLE offers ADD CONSTRAINT offers_state_check CHECK
 (state IN ('OPEN','SETTLING','CONFIRMED','EXPIRED','WITHDRAWN','SUPERSEDED','ABORTED'));
