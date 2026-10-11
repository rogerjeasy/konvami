-- The Session Report of a practice conversation (spec §6.5, §11: SessionReport), one per call.
-- content is the whole report as one document: it is written once and read as a whole. It is
-- null until the report is ready, and stays null when it failed or the call was too short.
-- requests counts how often the report was asked for, so that one which keeps failing is not
-- written without end. writing_since is set by the one worker that takes a pending report.
CREATE TABLE IF NOT EXISTS session_report (
    call_id text PRIMARY KEY REFERENCES voice_session (call_id) ON DELETE CASCADE,
    status text NOT NULL CHECK (status IN ('pending', 'ready', 'failed', 'too_short')),
    requested_at timestamptz NOT NULL,
    requests integer NOT NULL DEFAULT 1,
    writing_since timestamptz,
    content jsonb
);
