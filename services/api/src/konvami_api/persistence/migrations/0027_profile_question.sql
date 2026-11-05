-- Progressive profiling (spec §6.1.2): what became of each question the app asked about a
-- setting. A row exists once the learner answered or dismissed the question; a question never
-- acted on has none. `at` is the last answer or dismissal, which spaces the questions out;
-- `dismissals` counts the times it was dismissed, so that it is not asked for ever.
CREATE TABLE IF NOT EXISTS profile_question (
    user_id uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    question text NOT NULL,
    status text NOT NULL CHECK (status IN ('answered', 'dismissed')),
    dismissals integer NOT NULL DEFAULT 0,
    at timestamptz NOT NULL,
    PRIMARY KEY (user_id, question)
);
