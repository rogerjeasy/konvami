-- Voice minutes bought in packs (spec §6.21.2 "Minute packs"). A pack never expires; a week that
-- goes past its quota has used the packs for the rest. minute_pack holds the total bought (less
-- what was refunded), minute_pack_purchase the purchases (one row per store transaction, so a
-- webhook sent twice counts once, and a refund marks the row instead of deleting it, so the
-- purchase arriving again is not counted again), minute_pack_week the quota each week had when
-- its minutes were granted. How much of the packs a week used is never stored: it is
-- voice_week.seconds (which a call that ends early gives back from) less that quota.
CREATE TABLE IF NOT EXISTS minute_pack (
    user_id uuid PRIMARY KEY REFERENCES app_user (id) ON DELETE CASCADE,
    purchased_seconds bigint NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS minute_pack_purchase (
    transaction_id text PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    seconds integer NOT NULL CHECK (seconds > 0),
    purchased_at timestamptz NOT NULL,
    refunded_at timestamptz
);

CREATE TABLE IF NOT EXISTS minute_pack_week (
    user_id uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    week date NOT NULL,
    quota_seconds integer NOT NULL CHECK (quota_seconds >= 0),
    PRIMARY KEY (user_id, week)
);
