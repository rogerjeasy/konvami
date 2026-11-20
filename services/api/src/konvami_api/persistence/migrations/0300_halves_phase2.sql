-- Two Halves, phase 2 (design note 2026-11-20-two-halves-phase2-design.md): matching strangers
-- (behind its own switch), native nudges, the Bridge, owner warnings and suspensions with their
-- numbers, and cases written from a course import.
--
-- Deleting an account deletes its search, nudges and strikes (ON DELETE CASCADE).

-- A match between strangers is a mode of its own.
ALTER TABLE halves_case DROP CONSTRAINT IF EXISTS halves_case_mode_check;
ALTER TABLE halves_case ADD CONSTRAINT halves_case_mode_check
    CHECK (mode IN ('ai', 'friend', 'duo', 'match'));

-- A case written for this case alone (from a course import, 7.17): its whole template.
ALTER TABLE halves_case ADD COLUMN IF NOT EXISTS custom_template jsonb;

-- The Bridge's help for the listener ({"simpler": ..., "gist": ...}), and when the owner decided
-- on a held move.
ALTER TABLE halves_move ADD COLUMN IF NOT EXISTS bridge jsonb NOT NULL DEFAULT CAST('{}' AS jsonb);
ALTER TABLE halves_move ADD COLUMN IF NOT EXISTS decided_at timestamptz;

-- A learner looking for a partner (7.3). One at a time.
CREATE TABLE IF NOT EXISTS halves_ticket (
    user_id uuid PRIMARY KEY REFERENCES app_user (id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL,
    search_until timestamptz NOT NULL,
    remind boolean NOT NULL DEFAULT true,
    ai_offered_at timestamptz
);

CREATE INDEX IF NOT EXISTS halves_ticket_created_idx ON halves_ticket (created_at);

-- A short phrase a native suggested for a move they heard (7.7). Only a passed one is shown to
-- the speaker (7.9). One the verifier finds wrong or no better is dropped quietly; one that breaks
-- a safety rule is held for the owner's queue (6.15), like a move, and never shown.
CREATE TABLE IF NOT EXISTS halves_nudge (
    id uuid PRIMARY KEY,
    move_id uuid NOT NULL REFERENCES halves_move (id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    text text NOT NULL,
    status text NOT NULL CHECK (status IN ('checking', 'passed', 'dropped', 'held')),
    created_at timestamptz NOT NULL,
    attempts integer NOT NULL DEFAULT 0,
    reason text,
    delivered_at timestamptz,
    UNIQUE (move_id, user_id)
);

CREATE INDEX IF NOT EXISTS halves_nudge_status_idx ON halves_nudge (status, created_at);

-- What the owner recorded about a learner (6.15): strikes (three suspend), warnings and
-- suspensions, with the move they were about while it exists.
CREATE TABLE IF NOT EXISTS halves_strike (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    kind text NOT NULL CHECK (kind IN ('strike', 'warning', 'suspension')),
    reason text NOT NULL,
    move_id uuid REFERENCES halves_move (id) ON DELETE SET NULL,
    at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS halves_strike_user_idx ON halves_strike (user_id, at);
CREATE INDEX IF NOT EXISTS halves_block_created_idx ON halves_block (created_at);
