-- The adaptive level engine (spec §6.9): each change of level it made, kept with the
-- conversation that settled it, so that the conversation's report can announce it. The level
-- itself is the profile's starting_level, logged in profile_change like any other change.
CREATE TABLE IF NOT EXISTS level_step (
    call_id text PRIMARY KEY REFERENCES voice_session (call_id) ON DELETE CASCADE,
    language text NOT NULL,
    before_level text NOT NULL,
    after_level text NOT NULL,
    stepped_at timestamptz NOT NULL
);
