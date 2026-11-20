-- The Coach (spec §6.12, domain/coach.py): what it found for a learner on one day of their
-- calendar, and the suggestions it made, with the learner's answers and what came of them.
-- Kept for the learner's own history and to judge whether suggestions help; deleted with the
-- account.
CREATE TABLE IF NOT EXISTS coach_brief (
    user_id uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    language text NOT NULL,
    day date NOT NULL,
    -- The latest report when the brief was found: a new report finds it again.
    basis text NOT NULL,
    wording text NOT NULL CHECK (wording IN ('template', 'pending', 'model')),
    holding_back jsonb NOT NULL,
    going_well jsonb NOT NULL,
    created_at timestamptz NOT NULL,
    requested_at timestamptz,
    requests integer NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, language, day)
);

CREATE TABLE IF NOT EXISTS coach_suggestion (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    language text NOT NULL,
    day date NOT NULL,
    rank integer NOT NULL,
    kind text NOT NULL,
    key text NOT NULL,
    evidence jsonb NOT NULL,
    action jsonb NOT NULL,
    minutes integer NOT NULL,
    urgent boolean NOT NULL,
    status text NOT NULL CHECK (status IN ('open', 'accepted', 'snoozed', 'dismissed')),
    title text,
    why text,
    reason text CHECK (reason IN ('not_interested', 'already_know', 'too_long', 'not_useful')),
    responded_at timestamptz,
    outcome text CHECK (outcome IN ('resolved', 'persists')),
    acted boolean,
    settled_at timestamptz
);

CREATE INDEX IF NOT EXISTS coach_suggestion_day ON coach_suggestion (user_id, language, day);
