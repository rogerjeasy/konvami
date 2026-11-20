-- The story chain, Kettengeschichte (section 9; design note 2026-11-20-chain-story-design.md): an
-- audio story four learners of one language build line by line. Nothing here is free text a
-- learner typed: a codename the server made up, and the words of their lines, which are checked
-- before anyone hears them and deleted 30 days after the story ends. Blocks, duos and the cap on
-- wrong codes are Two Halves' own tables (0290, 0291).
--
-- Deleting an account deletes its profile, lines, invites and reports (ON DELETE CASCADE); its
-- seat in someone else's story stays, without the learner (ON DELETE SET NULL).

CREATE TABLE IF NOT EXISTS chain_profile (
    user_id uuid PRIMARY KEY REFERENCES app_user (id) ON DELETE CASCADE,
    codename text NOT NULL,
    band text NOT NULL CHECK (band IN ('adult', 'minor')),
    veil_default boolean NOT NULL,
    paused boolean NOT NULL DEFAULT false,
    -- The consent to let the other players hear one's lines (9.2, record `chain_voice`).
    consent_version integer NOT NULL,
    consent_at timestamptz NOT NULL,
    strikes integer NOT NULL DEFAULT 0,
    suspended boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS chain_story (
    id uuid PRIMARY KEY,
    opening_id text NOT NULL,
    language text NOT NULL,
    level text NOT NULL,
    mode text NOT NULL CHECK (mode IN ('solo', 'friends')),
    -- The learner who started it; their seat is seat 1. The narrator's requests are theirs.
    host uuid REFERENCES app_user (id) ON DELETE SET NULL,
    status text NOT NULL CHECK (status IN ('open', 'finishing', 'done')),
    created_at timestamptz NOT NULL,
    turn_since timestamptz NOT NULL,
    ended_at timestamptz,
    -- The radio play: [{"kind", "text", "audio_key", "position", "line_id"}].
    play jsonb NOT NULL DEFAULT CAST('[]' AS jsonb),
    play_status text NOT NULL DEFAULT 'none'
        CHECK (play_status IN ('none', 'pending', 'ready', 'failed')),
    -- The fixed reaction cards: {"<learner id>": "laughed"}.
    reactions jsonb NOT NULL DEFAULT CAST('{}' AS jsonb),
    opening_key text
);

CREATE INDEX IF NOT EXISTS chain_story_status_idx ON chain_story (status, created_at);

CREATE TABLE IF NOT EXISTS chain_seat (
    story_id uuid NOT NULL REFERENCES chain_story (id) ON DELETE CASCADE,
    seat integer NOT NULL CHECK (seat BETWEEN 1 AND 4),
    user_id uuid REFERENCES app_user (id) ON DELETE SET NULL,
    ai_name text,
    host boolean NOT NULL DEFAULT false,
    -- Blocked by another player: out of the story, an AI in the seat.
    removed boolean NOT NULL DEFAULT false,
    PRIMARY KEY (story_id, seat)
);

CREATE INDEX IF NOT EXISTS chain_seat_user_idx ON chain_seat (user_id);

CREATE TABLE IF NOT EXISTS chain_line (
    id uuid PRIMARY KEY,
    story_id uuid NOT NULL REFERENCES chain_story (id) ON DELETE CASCADE,
    position integer NOT NULL CHECK (position BETWEEN 1 AND 8),
    seat integer NOT NULL CHECK (seat BETWEEN 1 AND 4),
    -- None for an AI character's lines.
    user_id uuid REFERENCES app_user (id) ON DELETE CASCADE,
    ai_name text,
    status text NOT NULL CHECK (status IN ('checking', 'delivered', 'held', 'failed', 'removed')),
    transcript text NOT NULL,
    created_at timestamptz NOT NULL,
    audio_key text,
    veil_key text,
    veiled boolean NOT NULL DEFAULT false,
    reasons jsonb NOT NULL DEFAULT CAST('[]' AS jsonb),
    delivered_at timestamptz,
    recap text,
    corrections jsonb NOT NULL DEFAULT CAST('[]' AS jsonb),
    attempts integer NOT NULL DEFAULT 0,
    -- The learners who reported it: it is no longer shown to them.
    hidden_for jsonb NOT NULL DEFAULT CAST('[]' AS jsonb),
    delete_after timestamptz
);

CREATE INDEX IF NOT EXISTS chain_line_story_idx ON chain_line (story_id, created_at);
CREATE INDEX IF NOT EXISTS chain_line_user_idx ON chain_line (user_id, created_at);
CREATE INDEX IF NOT EXISTS chain_line_status_idx ON chain_line (status, created_at);
CREATE INDEX IF NOT EXISTS chain_line_expiry_idx ON chain_line (delete_after);

-- One code per story for its empty seats; seven days old, or no seat left, it is gone.
CREATE TABLE IF NOT EXISTS chain_invite (
    code text PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    story_id uuid NOT NULL UNIQUE REFERENCES chain_story (id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL,
    expires_at timestamptz NOT NULL
);

-- A line a learner reported, for the owner's queue (6.15). The note goes to the owner only.
CREATE TABLE IF NOT EXISTS chain_report (
    id uuid PRIMARY KEY,
    reporter uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    line_id uuid NOT NULL REFERENCES chain_line (id) ON DELETE CASCADE,
    reason text NOT NULL
        CHECK (reason IN ('harassment', 'sexual', 'personal', 'hate', 'off_topic', 'other')),
    note text,
    status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'removed', 'dismissed')),
    created_at timestamptz NOT NULL,
    resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS chain_report_queue_idx ON chain_report (status, created_at);

-- "Say it better" tries on one's own lines (9.7), counted per day; the recordings are not kept.
CREATE TABLE IF NOT EXISTS chain_retry_day (
    user_id uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    day date NOT NULL,
    tries integer NOT NULL,
    PRIMARY KEY (user_id, day)
);
