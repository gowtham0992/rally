-- One configured studio operator; permission provisioning remains server-only.
CREATE TABLE merchant_studios (
 studio_id text PRIMARY KEY, owner_user_id uuid NOT NULL, paypal_merchant_id text NOT NULL,
 resource_id text UNIQUE NOT NULL,
 setup_minutes integer NOT NULL CHECK(setup_minutes BETWEEN 0 AND 240),
 cleanup_minutes integer NOT NULL CHECK(cleanup_minutes BETWEEN 0 AND 240)
);
CREATE TABLE merchant_catalog_versions (
 studio_id text NOT NULL REFERENCES merchant_studios(studio_id), version_id text NOT NULL,
 catalog jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(studio_id,version_id)
);
CREATE TABLE merchant_requests (
 id uuid PRIMARY KEY, group_id uuid NOT NULL REFERENCES planning_groups(id),
 planning_revision integer NOT NULL, studio_id text NOT NULL REFERENCES merchant_studios(studio_id),
 catalog_version_id text NOT NULL, offering_id text NOT NULL, slot_id text NOT NULL,
 source_hash text NOT NULL, state text NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','APPROVED')),
 approved_offer_id uuid UNIQUE REFERENCES offers(id), created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(group_id,planning_revision),
 FOREIGN KEY(studio_id,catalog_version_id) REFERENCES merchant_catalog_versions(studio_id,version_id)
);
CREATE TABLE offer_snapshots (
 offer_id uuid PRIMARY KEY REFERENCES offers(id), request_id uuid UNIQUE NOT NULL REFERENCES merchant_requests(id),
 group_id uuid NOT NULL REFERENCES planning_groups(id), snapshot jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX merchant_requests_queue ON merchant_requests(studio_id,state,created_at);
ALTER TABLE merchant_studios ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_catalog_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE offer_snapshots ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION reject_frozen_record_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Frozen record requires a new version' USING ERRCODE='23514';
END;
$$;
CREATE TRIGGER immutable_catalog_version BEFORE UPDATE OR DELETE ON merchant_catalog_versions FOR EACH ROW EXECUTE FUNCTION reject_frozen_record_change();
CREATE TRIGGER immutable_offer_snapshot BEFORE UPDATE OR DELETE ON offer_snapshots FOR EACH ROW EXECUTE FUNCTION reject_frozen_record_change();
CREATE FUNCTION protect_issued_offer_terms() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM offer_snapshots WHERE offer_id=OLD.id) AND
  (NEW.merchant_id,NEW.offer_hash,NEW.amount_minor,NEW.currency,NEW.opened_at,NEW.deadline,NEW.reservation_end)
  IS DISTINCT FROM (OLD.merchant_id,OLD.offer_hash,OLD.amount_minor,OLD.currency,OLD.opened_at,OLD.deadline,OLD.reservation_end) THEN
  RAISE EXCEPTION 'Issued offer terms are immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER immutable_issued_terms BEFORE UPDATE ON offers FOR EACH ROW EXECUTE FUNCTION protect_issued_offer_terms();
CREATE FUNCTION protect_issued_roster() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF EXISTS(SELECT 1 FROM offer_snapshots WHERE offer_id=NEW.offer_id) THEN
   RAISE EXCEPTION 'Issued roster is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
 END IF;
 IF EXISTS(SELECT 1 FROM offer_snapshots WHERE offer_id=OLD.offer_id) AND
  (TG_OP='DELETE' OR (NEW.id,NEW.offer_id,NEW.user_id,NEW.ordinal) IS DISTINCT FROM (OLD.id,OLD.offer_id,OLD.user_id,OLD.ordinal)) THEN
  RAISE EXCEPTION 'Issued roster is immutable' USING ERRCODE='23514';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER immutable_issued_roster BEFORE INSERT OR UPDATE OR DELETE ON offer_members FOR EACH ROW EXECUTE FUNCTION protect_issued_roster();

CREATE FUNCTION protect_confirmed_preference() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW.id,NEW.member_id,NEW.confirmed,NEW.created_at) IS DISTINCT FROM (OLD.id,OLD.member_id,OLD.confirmed,OLD.created_at)
  OR (NEW.optional_text IS DISTINCT FROM OLD.optional_text AND NEW.optional_text IS NOT NULL) THEN
  RAISE EXCEPTION 'Confirmed preferences require a new revision' USING ERRCODE='23514';
 END IF;
 -- Clearing raw text is permitted for the retention job; never replace its wording.
 RETURN NEW;
END;
$$;
CREATE TRIGGER immutable_confirmed_preference BEFORE UPDATE ON preference_revisions FOR EACH ROW EXECUTE FUNCTION protect_confirmed_preference();
CREATE TRIGGER immutable_preference_history BEFORE DELETE ON preference_revisions FOR EACH ROW EXECUTE FUNCTION reject_frozen_record_change();
