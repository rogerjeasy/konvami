-- Live voice calls and what was said in them (spec §11: Session, Turn). Text only; audio
-- recording arrives with the library.

-- One row per call. call_id is the voice provider's id for the call.
CREATE TABLE IF NOT EXISTS voice_session (
    call_id text PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    purpose text NOT NULL CHECK (purpose IN ('onboarding', 'placement')),
    model text NOT NULL,
    started_at timestamptz NOT NULL,
    ended_at timestamptz,
    outcome text CHECK (outcome IN ('finished', 'timed_out', 'closed')),
    usage jsonb
);

-- For the per-learner daily call limit.
CREATE INDEX IF NOT EXISTS voice_session_user_idx ON voice_session (user_id, started_at);

-- What each side said, in order, as transcribed during the call.
CREATE TABLE IF NOT EXISTS voice_turn (
    call_id text NOT NULL REFERENCES voice_session (call_id) ON DELETE CASCADE,
    position integer NOT NULL,
    speaker text NOT NULL CHECK (speaker IN ('learner', 'persona')),
    text text NOT NULL,
    PRIMARY KEY (call_id, position)
);
