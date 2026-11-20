-- Radio Konvami (section 8; design note 2026-11-20-radio-design.md): a daily call-in show in each
-- language learned. Nothing here is free text a learner typed: a codename the server made up, the
-- words of their calls (checked before anyone else hears them), applause cards from a fixed list,
-- and a report's note, which only the owner reads. Calls and shows are deleted 30 days after the
-- show.
--
-- Deleting an account deletes its profile, calls, applause, reports and "Say it better" count (ON
-- DELETE CASCADE). A call's place in a show is a segment that refers to the call, so it goes with
-- it; the rest of the show (the host, AI callers) stays for the other listeners.

CREATE TABLE IF NOT EXISTS radio_profile (
    user_id uuid PRIMARY KEY REFERENCES app_user (id) ON DELETE CASCADE,
    codename text NOT NULL,
    band text NOT NULL CHECK (band IN ('adult', 'minor')),
    veil_default boolean NOT NULL,
    -- The consent to let other learners hear one's calls on the show (8.6), separate from the AI
    -- consent and from Two Halves. 0: not given (a minor, whose calls are never aired).
    consent_version integer NOT NULL,
    consent_at timestamptz
);

-- One show per language learned and day.
CREATE TABLE IF NOT EXISTS radio_episode (
    id uuid PRIMARY KEY,
    language text NOT NULL,
    day date NOT NULL,
    prompt_id text NOT NULL,
    status text NOT NULL
        CHECK (status IN ('open', 'building', 'ready', 'failed', 'pulled', 'expired')),
    created_at timestamptz NOT NULL,
    -- Who the show's requests are metered to; none once that learner's account is deleted.
    opened_by uuid REFERENCES app_user (id) ON DELETE SET NULL,
    built_at timestamptz,
    attempts integer NOT NULL DEFAULT 0,
    delete_after timestamptz,
    UNIQUE (language, day)
);

CREATE INDEX IF NOT EXISTS radio_episode_status_idx ON radio_episode (status, day);
CREATE INDEX IF NOT EXISTS radio_episode_expiry_idx ON radio_episode (delete_after);

CREATE TABLE IF NOT EXISTS radio_call (
    id uuid PRIMARY KEY,
    episode_id uuid NOT NULL REFERENCES radio_episode (id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    status text NOT NULL CHECK (
        status IN (
            'checking', 'ready', 'aired', 'not_picked', 'private', 'held', 'failed', 'removed'
        )
    ),
    transcript text NOT NULL,
    created_at timestamptz NOT NULL,
    audio_key text,
    veil_key text,
    veiled boolean NOT NULL DEFAULT true,
    -- Whether it may be aired: an adult who agreed, when they called.
    broadcast boolean NOT NULL DEFAULT false,
    reasons jsonb NOT NULL DEFAULT CAST('[]' AS jsonb),
    corrections jsonb NOT NULL DEFAULT CAST('[]' AS jsonb),
    attempts integer NOT NULL DEFAULT 0,
    aired_at timestamptz,
    delete_after timestamptz,
    -- Taken back by its caller while held or failed: hidden from them, kept for the owner.
    hidden boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS radio_call_episode_idx ON radio_call (episode_id, created_at);
CREATE INDEX IF NOT EXISTS radio_call_user_idx ON radio_call (user_id, created_at);
-- The owner's queue and the calls the hourly tick checks again.
CREATE INDEX IF NOT EXISTS radio_call_status_idx ON radio_call (status, created_at);
CREATE INDEX IF NOT EXISTS radio_call_expiry_idx ON radio_call (delete_after);

-- A show's playlist, in order: host lines, AI callers and learners' calls.
CREATE TABLE IF NOT EXISTS radio_segment (
    episode_id uuid NOT NULL REFERENCES radio_episode (id) ON DELETE CASCADE,
    position integer NOT NULL,
    kind text NOT NULL CHECK (kind IN ('host', 'call', 'ai_call')),
    speaker text NOT NULL,
    ai boolean NOT NULL,
    words text NOT NULL,
    audio_key text,
    call_id uuid REFERENCES radio_call (id) ON DELETE CASCADE,
    removed boolean NOT NULL DEFAULT false,
    PRIMARY KEY (episode_id, position)
);

-- One of the four applause cards, one per listener and segment.
CREATE TABLE IF NOT EXISTS radio_applause (
    user_id uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    episode_id uuid NOT NULL REFERENCES radio_episode (id) ON DELETE CASCADE,
    position integer NOT NULL,
    card text NOT NULL CHECK (card IN ('bravo', 'ha_ha', 'me_too', 'wow')),
    PRIMARY KEY (user_id, episode_id, position)
);

CREATE INDEX IF NOT EXISTS radio_applause_episode_idx ON radio_applause (episode_id);

-- A segment a listener reported (8.2), for the owner's queue (6.15). The note goes to the owner.
CREATE TABLE IF NOT EXISTS radio_report (
    id uuid PRIMARY KEY,
    reporter uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    episode_id uuid NOT NULL REFERENCES radio_episode (id) ON DELETE CASCADE,
    position integer NOT NULL,
    reason text NOT NULL
        CHECK (reason IN ('harassment', 'sexual', 'personal', 'hate', 'off_topic', 'other')),
    note text,
    status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'removed', 'dismissed')),
    created_at timestamptz NOT NULL,
    resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS radio_report_queue_idx ON radio_report (status, created_at);
CREATE INDEX IF NOT EXISTS radio_report_reporter_idx ON radio_report (reporter, episode_id);

-- A held or reported call the owner removed. Kept apart from the profile, so leaving the show and
-- joining again does not clear it; three suspend calling in. Deleted with the account.
CREATE TABLE IF NOT EXISTS radio_strike (
    id bigserial PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    call_id uuid,
    at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS radio_strike_user_idx ON radio_strike (user_id);

-- "Say it better" tries on a call (8.4) a learner made on a day; the tries are not kept.
CREATE TABLE IF NOT EXISTS radio_retry_day (
    user_id uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    day date NOT NULL,
    tries integer NOT NULL,
    PRIMARY KEY (user_id, day)
);
