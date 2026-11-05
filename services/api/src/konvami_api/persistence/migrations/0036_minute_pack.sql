-- Voice minutes bought in packs (spec §6.21.2 "Minute packs"). A pack never expires; a week that
-- goes past its quota draws the rest from what was bought. minute_pack holds the total bought,
-- minute_pack_purchase the purchases (one row per store transaction, so a webhook sent twice
-- counts once), minute_pack_week what each week drew.
CREATE TABLE IF NOT EXISTS minute_pack (
    user_id uuid PRIMARY KEY REFERENCES app_user (id) ON DELETE CASCADE,
    purchased_seconds bigint NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS minute_pack_purchase (
    transaction_id text PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    seconds integer NOT NULL CHECK (seconds > 0),
    purchased_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS minute_pack_week (
    user_id uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    week date NOT NULL,
    seconds integer NOT NULL CHECK (seconds >= 0),
    PRIMARY KEY (user_id, week)
);
