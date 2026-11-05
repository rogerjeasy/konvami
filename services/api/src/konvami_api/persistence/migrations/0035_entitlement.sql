-- What a learner has bought (spec §6.21.2), as RevenueCat's webhook last told us. One row per
-- learner; the app never writes it. tier is the highest plan bought; expires_at is when it ends
-- if it is not renewed (RevenueCat counts grace periods in); event_at is the time of the store
-- event it comes from, so an event that arrives late never overwrites a newer one.
CREATE TABLE IF NOT EXISTS entitlement (
    user_id uuid PRIMARY KEY REFERENCES app_user (id) ON DELETE CASCADE,
    tier text NOT NULL CHECK (tier IN ('free', 'plus', 'pro')),
    trial boolean NOT NULL DEFAULT false,
    auto_renew boolean NOT NULL DEFAULT true,
    billing_issue boolean NOT NULL DEFAULT false,
    expires_at timestamptz,
    product_id text NOT NULL,
    store text NOT NULL,
    event_at timestamptz NOT NULL
);
