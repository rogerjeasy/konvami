-- One optimistic ledger owns all transports of a practice call (§6.4).
CREATE TABLE IF NOT EXISTS practice_continuation (
    root_id text PRIMARY KEY REFERENCES voice_session (call_id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    revision integer NOT NULL DEFAULT 0,
    refunded boolean NOT NULL DEFAULT false,
    data jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS practice_continuation_user_idx ON practice_continuation (user_id);
CREATE INDEX IF NOT EXISTS practice_continuation_segments_idx
    ON practice_continuation USING gin ((data -> 'segments') jsonb_path_ops);
