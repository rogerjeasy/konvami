-- Two Halves (section 7, phase 1; design note 2026-11-20-two-halves-design.md): a voice mystery for
-- two learners, split by language. Nothing here is free text a learner typed: a codename the server
-- made up, a native language, a place from a fixed list, and the words of their moves, which are
-- checked before anyone hears them and deleted 30 days after the case ends.
--
-- Deleting an account deletes its profile, moves, invite, blocks, duos and reports (ON DELETE
-- CASCADE); its seat in someone else's case stays, without the learner (ON DELETE SET NULL), and
-- an AI finishes it.

CREATE TABLE IF NOT EXISTS halves_profile (
    user_id uuid PRIMARY KEY REFERENCES app_user (id) ON DELETE CASCADE,
    codename text NOT NULL,
    native_language text NOT NULL,
    -- "city:Zürich", "country:CH", or none.
    place text,
    band text NOT NULL CHECK (band IN ('adult', 'minor')),
    veil_default boolean NOT NULL,
    paused boolean NOT NULL DEFAULT false,
    -- The consent to let one other learner hear one's moves (7.2), separate from the AI consent.
    consent_version integer NOT NULL,
    consent_at timestamptz NOT NULL,
    strikes integer NOT NULL DEFAULT 0,
    suspended boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS halves_case (
    id uuid PRIMARY KEY,
    template_id text NOT NULL,
    mode text NOT NULL CHECK (mode IN ('ai', 'friend', 'duo')),
    status text NOT NULL CHECK (status IN ('open', 'solved', 'unsolved')),
    created_at timestamptz NOT NULL,
    ended_at timestamptz,
    season text,
    -- The recap scene of each learner's seat: {"A": [{"speaker", "text", "audio_key"}]}.
    recaps jsonb NOT NULL DEFAULT CAST('{}' AS jsonb),
    recap_status text NOT NULL DEFAULT 'none'
        CHECK (recap_status IN ('none', 'pending', 'ready', 'failed'))
);

CREATE INDEX IF NOT EXISTS halves_case_open_idx ON halves_case (status, created_at);

CREATE TABLE IF NOT EXISTS halves_seat (
    case_id uuid NOT NULL REFERENCES halves_case (id) ON DELETE CASCADE,
    seat text NOT NULL CHECK (seat IN ('A', 'B')),
    -- None: an AI holds the seat from the start, or the learner's account was deleted.
    user_id uuid REFERENCES app_user (id) ON DELETE SET NULL,
    stand_in text,
    speaks text NOT NULL,
    hears text NOT NULL,
    final_answers jsonb NOT NULL DEFAULT CAST('[]' AS jsonb),
    again boolean,
    last_active timestamptz,
    PRIMARY KEY (case_id, seat)
);

CREATE INDEX IF NOT EXISTS halves_seat_user_idx ON halves_seat (user_id);

CREATE TABLE IF NOT EXISTS halves_move (
    id uuid PRIMARY KEY,
    case_id uuid NOT NULL REFERENCES halves_case (id) ON DELETE CASCADE,
    seat text NOT NULL CHECK (seat IN ('A', 'B')),
    round integer NOT NULL CHECK (round BETWEEN 1 AND 3),
    -- None for the AI stand-in's moves.
    user_id uuid REFERENCES app_user (id) ON DELETE CASCADE,
    status text NOT NULL CHECK (status IN ('checking', 'delivered', 'held', 'failed', 'removed')),
    transcript text NOT NULL,
    created_at timestamptz NOT NULL,
    audio_key text,
    veil_key text,
    veiled boolean NOT NULL DEFAULT false,
    reasons jsonb NOT NULL DEFAULT CAST('[]' AS jsonb),
    delivered_at timestamptz,
    reaction text,
    answers jsonb NOT NULL DEFAULT CAST('[]' AS jsonb),
    corrections jsonb NOT NULL DEFAULT CAST('[]' AS jsonb),
    attempts integer NOT NULL DEFAULT 0,
    hidden boolean NOT NULL DEFAULT false,
    delete_after timestamptz
);

CREATE INDEX IF NOT EXISTS halves_move_case_idx ON halves_move (case_id, created_at);
CREATE INDEX IF NOT EXISTS halves_move_user_idx ON halves_move (user_id, created_at);
-- The owner's queue and the moves the hourly tick checks again.
CREATE INDEX IF NOT EXISTS halves_move_status_idx ON halves_move (status, created_at);
CREATE INDEX IF NOT EXISTS halves_move_expiry_idx ON halves_move (delete_after);

-- One code per learner at a time; redeemed or seven days old, it is gone.
CREATE TABLE IF NOT EXISTS halves_invite (
    code text PRIMARY KEY,
    user_id uuid NOT NULL UNIQUE REFERENCES app_user (id) ON DELETE CASCADE,
    template_id text,
    created_at timestamptz NOT NULL,
    expires_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS halves_block (
    id uuid PRIMARY KEY,
    blocker uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    blocked uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    -- The codename as it was, so the list can name them after they leave.
    codename text NOT NULL,
    created_at timestamptz NOT NULL,
    UNIQUE (blocker, blocked)
);

CREATE INDEX IF NOT EXISTS halves_block_blocked_idx ON halves_block (blocked);

-- Two learners who both said "play again". user_a is the smaller id, so a pair is stored once.
CREATE TABLE IF NOT EXISTS halves_duo (
    id uuid PRIMARY KEY,
    user_a uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    user_b uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL,
    UNIQUE (user_a, user_b),
    CHECK (user_a < user_b)
);

CREATE INDEX IF NOT EXISTS halves_duo_b_idx ON halves_duo (user_b);

-- A move a learner reported (7.10), for the owner's queue (6.15). The note goes to the owner only.
CREATE TABLE IF NOT EXISTS halves_report (
    id uuid PRIMARY KEY,
    reporter uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    move_id uuid NOT NULL REFERENCES halves_move (id) ON DELETE CASCADE,
    reason text NOT NULL
        CHECK (reason IN ('harassment', 'sexual', 'personal', 'hate', 'off_topic', 'other')),
    note text,
    status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'removed', 'dismissed')),
    created_at timestamptz NOT NULL,
    resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS halves_report_queue_idx ON halves_report (status, created_at);
