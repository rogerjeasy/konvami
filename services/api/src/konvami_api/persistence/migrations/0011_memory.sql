-- Memory (spec §6.11, §11: Memory): what a learner's partners know about them from earlier
-- conversations. persona_id is set for what belongs to one partner and null for what every
-- partner knows; a partner who is removed takes what was theirs along. text_key is the text
-- without capitals and punctuation. day is the date of an event.
CREATE TABLE IF NOT EXISTS memory (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    persona_id uuid REFERENCES persona (id) ON DELETE CASCADE,
    kind text NOT NULL CHECK (kind IN ('fact', 'event', 'preference', 'relationship')),
    text_key text NOT NULL,
    text text NOT NULL,
    day date,
    importance smallint NOT NULL CHECK (importance BETWEEN 1 AND 3),
    source_call_id text REFERENCES voice_session (call_id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL
);

-- A learner has one memory with the same words for the same partner. NULLS NOT DISTINCT makes
-- that hold for what every partner knows as well, where persona_id is null.
CREATE UNIQUE INDEX IF NOT EXISTS memory_words_idx
    ON memory (user_id, persona_id, text_key) NULLS NOT DISTINCT;

-- The conversations that were read for memories, so that none is read twice (each reading is a
-- request to a paid model, and a second one would write the same things down in other words).
CREATE TABLE IF NOT EXISTS memory_extraction (
    call_id text PRIMARY KEY REFERENCES voice_session (call_id) ON DELETE CASCADE,
    started_at timestamptz NOT NULL
);
