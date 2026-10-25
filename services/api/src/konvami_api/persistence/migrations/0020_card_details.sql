-- Rich cards (spec §6.7): a word card's forms (article, plural, verb forms, comparison) as one
-- document, written once by a text model; details_claimed_at marks a worker filling them in, so
-- that two workers at once never pay for the same card.
ALTER TABLE card ADD COLUMN IF NOT EXISTS details jsonb;
ALTER TABLE card ADD COLUMN IF NOT EXISTS details_claimed_at timestamptz;
