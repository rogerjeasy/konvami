-- Feedback from the app's help screen (spec §6.21.4 "Support: an in-app feedback form"): a bug,
-- an idea or something else, in the learner's words. app_version, platform and os_version are
-- filled only when the learner ticked "include device and app version". The rows go with the
-- learner's account (6.9 Delete account).
CREATE TABLE IF NOT EXISTS feedback (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    category text NOT NULL CHECK (category IN ('bug', 'idea', 'other')),
    message text NOT NULL,
    app_version text,
    platform text CHECK (platform IN ('ios', 'android', 'web')),
    os_version text,
    status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
    created_at timestamptz NOT NULL,
    resolved_at timestamptz
);

-- The owner's inbox: open first, newest first.
CREATE INDEX IF NOT EXISTS feedback_inbox_idx ON feedback (status, created_at DESC);
-- A learner's feedback is counted per day.
CREATE INDEX IF NOT EXISTS feedback_user_idx ON feedback (user_id, created_at);
