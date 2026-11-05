-- Flagging an AI turn or a correction (spec §6.21.3, §16.1): the learner reports it, the owner
-- reads the queue. kind is what was flagged ("turn": a partner's line of the transcript;
-- "correction": a mistake of the report); item_index is its position in the transcript or the
-- report, which never changes once written. excerpt is the flagged text as the learner saw it,
-- kept so the queue can be read after the conversation is gone. One flag per learner and item:
-- flagging it again changes the reason and reopens it.
CREATE TABLE IF NOT EXISTS content_flag (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    call_id text NOT NULL REFERENCES voice_session (call_id) ON DELETE CASCADE,
    kind text NOT NULL CHECK (kind IN ('turn', 'correction')),
    item_index integer NOT NULL,
    reason text NOT NULL CHECK (reason IN ('offensive', 'wrong', 'not_said', 'other')),
    note text,
    excerpt text NOT NULL,
    status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
    flagged_at timestamptz NOT NULL,
    resolved_at timestamptz,
    UNIQUE (user_id, call_id, kind, item_index)
);

-- The owner's queue: open flags first, newest first.
CREATE INDEX IF NOT EXISTS content_flag_queue_idx ON content_flag (status, flagged_at DESC);
-- A learner's flags are read per conversation and counted per day.
CREATE INDEX IF NOT EXISTS content_flag_user_idx ON content_flag (user_id, flagged_at);
