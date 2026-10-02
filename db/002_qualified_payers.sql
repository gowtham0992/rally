ALTER TABLE offer_members DROP CONSTRAINT IF EXISTS offer_members_offer_id_payer_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS independent_qualified_payers ON offer_members(offer_id,payer_id) WHERE qualified_at IS NOT NULL;
