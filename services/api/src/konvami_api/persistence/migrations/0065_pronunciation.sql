-- Pronunciation lab (spec §6.14): the drills a learner made, the tally of every word they were
-- asked to say, and how many drills they made each day (for the daily limit, like retry_day).
-- The recordings themselves are not kept: only what the verbatim pass heard in them.

CREATE TABLE IF NOT EXISTS pronunciation_day (
    user_id uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    day date NOT NULL,
    drills integer NOT NULL,
    PRIMARY KEY (user_id, day)
);

-- One row per drill. drill is "word" (a word or the two words of a pair), "shadow" (a sentence) or
-- "listen" (which word of a pair was heard: target is the word played, heard the one picked).
-- sound_id is null for a problem word drilled on its own. Progress can chart this later.
CREATE TABLE IF NOT EXISTS pronunciation_drill (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    language text NOT NULL,
    drilled_at timestamptz NOT NULL,
    drill text NOT NULL,
    sound_id text,
    target text NOT NULL,
    heard text NOT NULL,
    was_right boolean NOT NULL
);

CREATE INDEX IF NOT EXISTS pronunciation_drill_sound_idx
    ON pronunciation_drill (user_id, language, sound_id);

-- The words a learner was asked to say that were ever missed, with how often and how many times in
-- a row they have been heard right since. word_key is the word without capitals. A word is a
-- problem word while it was missed and has not been heard right twice in a row since.
CREATE TABLE IF NOT EXISTS pronunciation_word (
    user_id uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    language text NOT NULL,
    word_key text NOT NULL,
    word text NOT NULL,
    sound_id text,
    misses integer NOT NULL,
    streak integer NOT NULL,
    last_drilled timestamptz NOT NULL,
    PRIMARY KEY (user_id, language, word_key)
);
