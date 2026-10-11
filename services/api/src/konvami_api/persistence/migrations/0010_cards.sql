-- Flashcards (spec §6.7, §11: Card): words and corrections from a learner's conversations.
-- front_key is the front without capitals and punctuation: a learner has one card per kind
-- with the same words in a language. stability and difficulty are the scheduler's memory of
-- the card (FSRS); they are null until the first review.
CREATE TABLE IF NOT EXISTS card (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    language text NOT NULL,
    kind text NOT NULL CHECK (kind IN ('word', 'correction')),
    front_key text NOT NULL,
    front text NOT NULL,
    back text NOT NULL,
    note text,
    explained_in text NOT NULL,
    source_call_id text REFERENCES voice_session (call_id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL,
    due_at timestamptz NOT NULL,
    reviewed_at timestamptz,
    stability double precision,
    difficulty double precision,
    reviews integer NOT NULL DEFAULT 0,
    lapses integer NOT NULL DEFAULT 0,
    UNIQUE (user_id, language, kind, front_key)
);

-- The review queue and the count of due cards read a learner's deck by when cards are due.
CREATE INDEX IF NOT EXISTS card_due_idx ON card (user_id, language, due_at);

-- Every review, in order (position 1 is a card's first). The scheduler does not read it; it is
-- kept for the learner's progress and for fitting the scheduler to them later.
CREATE TABLE IF NOT EXISTS card_review (
    card_id uuid NOT NULL REFERENCES card (id) ON DELETE CASCADE,
    position integer NOT NULL,
    reviewed_at timestamptz NOT NULL,
    rating text NOT NULL CHECK (rating IN ('again', 'hard', 'good', 'easy')),
    PRIMARY KEY (card_id, position)
);
