-- Voice review (spec §6.7): how many cards each learner answered out loud on a day, for the
-- daily limit (like retry_day). The answers themselves are not kept: the rating the learner
-- gives is, as for a card turned over.
CREATE TABLE IF NOT EXISTS voice_answer_day (
    user_id uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    day date NOT NULL,
    answers integer NOT NULL,
    PRIMARY KEY (user_id, day)
);
