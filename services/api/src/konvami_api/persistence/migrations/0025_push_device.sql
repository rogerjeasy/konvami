-- Push from the server (spec §6.18): the phones the app registered while the learner has
-- reminders on and the phone allows notifications. A token is one phone's address at the push
-- provider; registered again by another account, the phone moves to it. timezone, language and
-- remind_at ("18:00") say when and in which language the weekly nudge comes.
CREATE TABLE IF NOT EXISTS push_device (
    token text PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    platform text NOT NULL CHECK (platform IN ('ios', 'android')),
    timezone text NOT NULL,
    language text NOT NULL,
    remind_at text NOT NULL,
    registered_at timestamptz NOT NULL,
    nudged_at timestamptz
);

-- A learner's phones are read for every push to them.
CREATE INDEX IF NOT EXISTS push_device_user_idx ON push_device (user_id);
