-- Cost control (spec §6.19, §17; decision D5). One row per paid request to a provider, with
-- the learner and feature it served and its estimated cost in dollars. A deleted account's
-- rows stay without the learner: what was spent still counts toward the month.
CREATE TABLE IF NOT EXISTS usage_charge (
    id bigserial PRIMARY KEY,
    user_id uuid REFERENCES app_user (id) ON DELETE SET NULL,
    feature text NOT NULL,
    provider text NOT NULL,
    model text NOT NULL,
    units jsonb NOT NULL,
    usd numeric(14, 8) NOT NULL,
    priced boolean NOT NULL,
    charged_at timestamptz NOT NULL
);

-- The month's total and the owner's view read a range of time.
CREATE INDEX IF NOT EXISTS usage_charge_time_idx ON usage_charge (charged_at);

-- Each budget step emailed in a month (economy: past the target; paused: at the ceiling), so
-- it is emailed once.
CREATE TABLE IF NOT EXISTS spend_alert (
    month date NOT NULL,
    level text NOT NULL CHECK (level IN ('economy', 'paused')),
    PRIMARY KEY (month, level)
);

-- The longest a call may last, as granted when it started (at most the minutes left).
ALTER TABLE voice_session ADD COLUMN IF NOT EXISTS max_seconds integer;

-- Each learner's voice seconds per week (spec §6.19): the time granted to calls, less what
-- ended calls did not use. Granting is one statement on this row, so calls started at the same
-- moment cannot share out the same minutes. last_grant is what the latest grant gave.
CREATE TABLE IF NOT EXISTS voice_week (
    user_id uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    week date NOT NULL,
    seconds integer NOT NULL,
    last_grant integer NOT NULL,
    PRIMARY KEY (user_id, week)
);
