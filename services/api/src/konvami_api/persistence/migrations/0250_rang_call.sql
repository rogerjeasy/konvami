-- "Your partner calls you" (5.28; design note 2026-11-20-partner-calls): a practice call the
-- learner accepted from a partner's ring, kept so accepted rings can be counted and the call's
-- shorter limit is known afterwards.
ALTER TABLE voice_session ADD COLUMN IF NOT EXISTS rang boolean NOT NULL DEFAULT false;
