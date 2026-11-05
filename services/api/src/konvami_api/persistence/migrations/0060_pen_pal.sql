-- Voice-note pen-pal mode (spec §6.16): what a learner chose for their partners' unprompted notes,
-- and the notes of each thread (one thread per partner). quiet_from and quiet_to are hours of the
-- day on the learner's clock (timezone) between which no note is sent.
CREATE TABLE IF NOT EXISTS penpal_settings (
    user_id uuid PRIMARY KEY REFERENCES app_user (id) ON DELETE CASCADE,
    enabled boolean NOT NULL DEFAULT false,
    per_week smallint NOT NULL DEFAULT 3 CHECK (per_week BETWEEN 1 AND 7),
    quiet_from smallint NOT NULL DEFAULT 21 CHECK (quiet_from BETWEEN 0 AND 23),
    quiet_to smallint NOT NULL DEFAULT 8 CHECK (quiet_to BETWEEN 0 AND 23),
    timezone text NOT NULL DEFAULT 'UTC',
    updated_at timestamptz NOT NULL
);

-- The schedule reads the learners who turned it on.
CREATE INDEX IF NOT EXISTS penpal_settings_enabled_idx ON penpal_settings (user_id) WHERE enabled;

-- A note of a thread. sender is who spoke; body is what a partner's note says, or what the learner
-- said, word for word. reply_to is the learner's note that a partner's answer is to (null for a
-- note a partner wrote on its own). audio_key is where the sound is kept, if there is one.
-- corrections are a partner's corrections of the note it answers, with whether the second check
-- confirmed each. attempts and claimed_at keep a pending note from being written twice.
-- seq gives a thread its order, whatever the clock said.
CREATE TABLE IF NOT EXISTS penpal_note (
    seq bigint GENERATED ALWAYS AS IDENTITY,
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    persona_id uuid NOT NULL REFERENCES persona (id) ON DELETE CASCADE,
    sender text NOT NULL CHECK (sender IN ('partner', 'learner')),
    status text NOT NULL CHECK (status IN ('pending', 'ready', 'failed')),
    body text NOT NULL,
    reply_to uuid,
    audio_key text,
    corrections jsonb NOT NULL DEFAULT '[]',
    attempts smallint NOT NULL DEFAULT 0,
    claimed_at timestamptz,
    opened boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL
);

-- A thread is read in order; the limits count a learner's recent notes.
CREATE INDEX IF NOT EXISTS penpal_note_thread_idx ON penpal_note (user_id, persona_id, seq);
CREATE INDEX IF NOT EXISTS penpal_note_recent_idx ON penpal_note (user_id, sender, created_at);
