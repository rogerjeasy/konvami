-- Phrasebook (spec §6.7): the phrases a learner needs in their life, each with its meaning in the
-- language the learner reads. phrase_key is the phrase without capitals and punctuation, as for
-- cards: a learner has one entry per phrase in a language. situation is what they asked for
-- when it was suggested ("an appointment at the doctor"), if anything.
CREATE TABLE IF NOT EXISTS phrase (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    language text NOT NULL,
    phrase_key text NOT NULL,
    phrase text NOT NULL,
    meaning text NOT NULL,
    situation text,
    explained_in text NOT NULL,
    created_at timestamptz NOT NULL,
    UNIQUE (user_id, language, phrase_key)
);

-- The phrasebook is read newest first.
CREATE INDEX IF NOT EXISTS phrase_listed_idx ON phrase (user_id, language, created_at DESC);
