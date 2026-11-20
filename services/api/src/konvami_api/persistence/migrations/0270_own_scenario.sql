-- The learner's own role-plays (5.31, spec §6.3) and the rehearsals of events in their life
-- (spec §7 "rehearse, then debrief"). A scene is written in the learner's explanation language:
-- its title, whom the partner plays, the situation, and three goals (`goals`: a JSON list of
-- {"id", "text"}). source is 'custom' for one the learner described and 'event' for the
-- rehearsal of an event memory; a rehearsal goes with its memory, so deleting what the partners
-- know about the event deletes its rehearsal too.
CREATE TABLE IF NOT EXISTS own_scenario (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    language text NOT NULL,
    source text NOT NULL CHECK (source IN ('custom', 'event')),
    memory_id uuid REFERENCES memory (id) ON DELETE CASCADE,
    title text NOT NULL,
    character text NOT NULL,
    situation text NOT NULL,
    goals jsonb NOT NULL,
    level text NOT NULL,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    UNIQUE (user_id, memory_id)
);

-- A learner's role-plays are read the most recently changed first.
CREATE INDEX IF NOT EXISTS own_scenario_listed_idx
    ON own_scenario (user_id, language, updated_at DESC);
