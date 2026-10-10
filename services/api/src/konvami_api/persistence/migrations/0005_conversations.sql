-- Practice conversations (spec §6.3): a voice call with one of the learner's partners.

ALTER TABLE voice_session DROP CONSTRAINT IF EXISTS voice_session_purpose_check;

ALTER TABLE voice_session ADD CONSTRAINT voice_session_purpose_check
    CHECK (purpose IN ('onboarding', 'placement', 'practice'));

-- The partner of a practice call. Removing a partner keeps the conversations they had.
ALTER TABLE voice_session
    ADD COLUMN IF NOT EXISTS persona_id uuid REFERENCES persona (id) ON DELETE SET NULL;

-- The library and the home screen read a learner's practice, newest first.
CREATE INDEX IF NOT EXISTS voice_session_practice_idx
    ON voice_session (user_id, started_at DESC) WHERE purpose = 'practice';
