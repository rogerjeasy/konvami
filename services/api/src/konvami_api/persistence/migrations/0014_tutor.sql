-- Ask-the-Tutor (spec §6.8, §12.3): every question a learner asked and its answer, newest
-- first on the Tutor screen. answer is the whole answer as one document (explanation, examples,
-- topic, unsure): it is written once and read as a whole. source is where it was asked.
CREATE TABLE IF NOT EXISTS tutor_question (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    asked_at timestamptz NOT NULL,
    question text NOT NULL,
    answer jsonb NOT NULL,
    source text NOT NULL CHECK (source IN ('text', 'report', 'call'))
);

CREATE INDEX IF NOT EXISTS tutor_question_user_idx ON tutor_question (user_id, asked_at DESC);

-- How many questions each learner asked on a day, for the daily limit (like persona_draft_day).
CREATE TABLE IF NOT EXISTS tutor_day (
    user_id uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    day date NOT NULL,
    questions integer NOT NULL,
    PRIMARY KEY (user_id, day)
);
