-- Premium voices (spec §6.21.2): the ElevenLabs voice a learner chose to have the app read aloud
-- what it speaks outside a call. No row: the standard voice. voice_id is the provider's own id,
-- checked against the configured voices when it is used, so a voice dropped from the
-- configuration simply stops being used.
CREATE TABLE IF NOT EXISTS premium_voice_choice (
    user_id uuid PRIMARY KEY REFERENCES app_user (id) ON DELETE CASCADE,
    voice_id text NOT NULL,
    chosen_at timestamptz NOT NULL
);
