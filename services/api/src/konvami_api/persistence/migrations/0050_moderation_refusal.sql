-- Moderation (spec §6.21.4, §16.3): how often a learner's free text was refused in a day, by
-- reason. Only the count is kept, never the text. It limits attempts to make a partner break its
-- rules, and tells the owner how often it happens.
CREATE TABLE IF NOT EXISTS moderation_refusal (
    user_id uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    day date NOT NULL,
    reason text NOT NULL,
    refusals integer NOT NULL,
    PRIMARY KEY (user_id, day, reason)
);
