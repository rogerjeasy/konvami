-- Two Halves (7.12): how many wrong invite codes a learner tried on a day. A code is a key to a
-- friend's case, so guessing is capped (like voice_answer_day). The codes tried are not kept.
CREATE TABLE IF NOT EXISTS halves_redeem_day (
    user_id uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    day date NOT NULL,
    wrong integer NOT NULL,
    PRIMARY KEY (user_id, day)
);
