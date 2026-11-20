-- Listening stories (5.29): the episodes of a learner's series, per language learned. cast_ids are
-- the one or two partners who tell it. lines, questions and words are what the writer made (the
-- lines with where each one's sound is kept); answers are the learner's latest answer per question.
-- attempts and claimed_at keep a pending episode from being written twice.
CREATE TABLE IF NOT EXISTS story_episode (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    language text NOT NULL,
    number integer NOT NULL CHECK (number > 0),
    cast_ids jsonb NOT NULL,
    status text NOT NULL CHECK (status IN ('pending', 'ready', 'failed')),
    title text NOT NULL DEFAULT '',
    summary text NOT NULL DEFAULT '',
    lines jsonb NOT NULL DEFAULT '[]',
    questions jsonb NOT NULL DEFAULT '[]',
    words jsonb NOT NULL DEFAULT '[]',
    answers jsonb NOT NULL DEFAULT '[]',
    attempts smallint NOT NULL DEFAULT 0,
    claimed_at timestamptz,
    listened_at timestamptz,
    created_at timestamptz NOT NULL
);

-- A series is read newest first; the daily limit counts a learner's recent episodes.
CREATE INDEX IF NOT EXISTS story_episode_learner_idx
    ON story_episode (user_id, language, created_at DESC);

-- The words a learner heard in an episode they listened to the end: passive vocabulary (§6.7),
-- counted with the words heard in conversations (vocabulary_evidence).
CREATE TABLE IF NOT EXISTS story_word (
    episode_id uuid NOT NULL REFERENCES story_episode (id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    language text NOT NULL,
    word_key text NOT NULL,
    word text NOT NULL,
    PRIMARY KEY (episode_id, word_key)
);

CREATE INDEX IF NOT EXISTS story_word_learner_idx ON story_word (user_id, language, word_key);
