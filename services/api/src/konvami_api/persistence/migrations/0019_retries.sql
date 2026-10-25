-- "Say it better" (spec §6.5): each attempt at saying a report's correction again, and whether it
-- was right. The recording itself is not kept. mistake_index is the correction's position in the
-- report, which never changes once the report is written.
CREATE TABLE IF NOT EXISTS retry_attempt (
    user_id uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    call_id text NOT NULL REFERENCES voice_session (call_id) ON DELETE CASCADE,
    mistake_index integer NOT NULL,
    attempted_at timestamptz NOT NULL,
    was_right boolean NOT NULL
);

CREATE INDEX IF NOT EXISTS retry_attempt_call_idx ON retry_attempt (call_id, mistake_index);

-- How many attempts each learner made on a day, for the daily limit (like tutor_day).
CREATE TABLE IF NOT EXISTS retry_day (
    user_id uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    day date NOT NULL,
    attempts integer NOT NULL,
    PRIMARY KEY (user_id, day)
);
