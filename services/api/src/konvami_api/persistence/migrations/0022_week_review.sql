-- The weekly check-in (spec §6.12, §6.15): last week's numbers as they were when the learner
-- asked for it, and the few sentences their partner wrote from them. One per learner, language
-- and week (its Monday on the learner's calendar). The plan itself is not stored: it is worked
-- out again from what was done every time it is read.
CREATE TABLE IF NOT EXISTS week_review (
    user_id uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    language text NOT NULL,
    week date NOT NULL,
    status text NOT NULL CHECK (status IN ('pending', 'ready', 'failed')),
    numbers jsonb NOT NULL,
    text text,
    partner text NOT NULL,
    voice text NOT NULL,
    requested_at timestamptz NOT NULL,
    requests integer NOT NULL,
    PRIMARY KEY (user_id, language, week)
);
