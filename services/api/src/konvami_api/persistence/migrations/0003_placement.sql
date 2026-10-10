-- The result of the voice placement test (spec §6.1.1 step 4), one per learner and language.
-- A later test replaces the earlier result; the level history lives in profile_change.
CREATE TABLE IF NOT EXISTS placement_result (
    user_id uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    language text NOT NULL,
    levels jsonb NOT NULL,
    overall text NOT NULL,
    weak_areas jsonb NOT NULL,
    measured_at timestamptz NOT NULL,
    PRIMARY KEY (user_id, language)
);
