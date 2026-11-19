-- Reviews made on the phone, perhaps offline, carry the phone's id for each rating (spec §10.3),
-- so a sync that is sent again after a lost answer stores each rating once. NULL for reviews
-- made online, which need no such id.
ALTER TABLE card_review ADD COLUMN IF NOT EXISTS client_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS card_review_client_idx
    ON card_review (card_id, client_id) WHERE client_id IS NOT NULL;
