-- Accounts, the Learner Configuration Profile and onboarding progress (spec §6.1.2, §11).

-- One row per account. The id is the Cognito subject. Deleting the row deletes everything the
-- user owns (ON DELETE CASCADE below), which is what account deletion needs.
CREATE TABLE IF NOT EXISTS app_user (
    id uuid PRIMARY KEY,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- One row per profile field. scope is 'global' or a target-language code. value is JSON; the
-- JSON value null is an answer ("no exam"), a missing row is a question not answered yet.
CREATE TABLE IF NOT EXISTS profile_field (
    user_id uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    scope text NOT NULL,
    field text NOT NULL,
    value jsonb NOT NULL,
    source text NOT NULL CHECK (source IN ('asked', 'measured', 'inferred_confirmed')),
    updated_at timestamptz NOT NULL,
    PRIMARY KEY (user_id, scope, field)
);

-- Every change to a profile field, oldest first, so a change can be shown and undone.
CREATE TABLE IF NOT EXISTS profile_change (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    scope text NOT NULL,
    field text NOT NULL,
    old_value jsonb,
    new_value jsonb NOT NULL,
    source text NOT NULL CHECK (source IN ('asked', 'measured', 'inferred_confirmed')),
    origin text NOT NULL CHECK (origin IN ('form', 'voice', 'system')),
    changed_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS profile_change_user_idx ON profile_change (user_id, id);

-- Where a learner is in onboarding. The stage itself is worked out from this and the profile.
CREATE TABLE IF NOT EXISTS onboarding (
    user_id uuid PRIMARY KEY REFERENCES app_user (id) ON DELETE CASCADE,
    essentials_confirmed_at timestamptz,
    placement text NOT NULL DEFAULT 'not_started'
);
