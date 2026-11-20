-- A learner's own card schedule (spec §6.7; 5.11): the FSRS parameters fitted to their review
-- log by domain/fsrs_fit.py. One row per learner once a fit was started. `weights` is a JSON
-- array of the 21 parameters, or null while the learner keeps the published defaults (no fit
-- yet, or a fit that did not predict their reviews better). The losses are kept to see how
-- well fits do; nothing else reads them.
CREATE TABLE IF NOT EXISTS card_schedule (
    user_id uuid PRIMARY KEY REFERENCES app_user (id) ON DELETE CASCADE,
    weights jsonb,
    attempted_at timestamptz NOT NULL,
    fitted_at timestamptz,
    reviews integer NOT NULL DEFAULT 0,
    default_loss double precision,
    fitted_loss double precision
);
