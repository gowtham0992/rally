-- Disposable empty test schemas only.
DROP TRIGGER immutable_confirmed_preference ON preference_revisions;
DROP TRIGGER immutable_preference_history ON preference_revisions;
DROP FUNCTION protect_confirmed_preference();
DROP TRIGGER immutable_issued_roster ON offer_members;
DROP TRIGGER immutable_issued_terms ON offers;
DROP TABLE offer_snapshots;
DROP TABLE merchant_requests;
DROP TABLE merchant_catalog_versions;
DROP TABLE merchant_studios;
DROP FUNCTION protect_issued_roster();
DROP FUNCTION protect_issued_offer_terms();
DROP FUNCTION reject_frozen_record_change();
