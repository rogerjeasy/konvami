-- Exam simulations (spec §6.13): one per exam call, with the speaking test, the card of each
-- part, and its score once written (the parts' marks, feedback and model answers). The call's
-- turns are in voice_turn, like any call's.
-- An exam simulation is a call of its own purpose. Dropping and adding again is safe to re-run.
ALTER TABLE voice_session DROP CONSTRAINT IF EXISTS voice_session_purpose_check;
ALTER TABLE voice_session ADD CONSTRAINT voice_session_purpose_check
    CHECK (purpose IN ('onboarding', 'placement', 'practice', 'exam'));

CREATE TABLE IF NOT EXISTS exam_simulation (
    call_id text PRIMARY KEY REFERENCES voice_session (call_id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    language text NOT NULL,
    exam text NOT NULL,
    cards jsonb NOT NULL,
    voice text NOT NULL,
    started_at timestamptz NOT NULL,
    status text NOT NULL CHECK (status IN ('pending', 'ready', 'failed', 'too_short')),
    requested_at timestamptz NOT NULL,
    requests integer NOT NULL,
    result jsonb
);

-- The centre lists a learner's simulations, newest first.
CREATE INDEX IF NOT EXISTS exam_simulation_user_idx ON exam_simulation (user_id, started_at);
