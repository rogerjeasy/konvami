-- Account deletion that stays deleted, and a draft limit that cannot be raced (profile design
-- §4c, found in review).

-- Accounts that were deleted. An access token of such an account still works for up to an
-- hour; while its id is listed here, nothing is stored for it again. A row is removed a day
-- after the deletion, because the id identified a person.
CREATE TABLE IF NOT EXISTS deleted_user (
    id uuid PRIMARY KEY,
    deleted_at timestamptz NOT NULL
);

-- How many personas a learner had written from a description on one day (UTC). One row per
-- learner and day, so the count is raised and checked against the limit in one statement.
CREATE TABLE IF NOT EXISTS persona_draft_day (
    user_id uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    day date NOT NULL,
    drafts integer NOT NULL,
    PRIMARY KEY (user_id, day)
);

-- Replaced by persona_draft_day: one row per draft could only be counted, then checked.
DROP TABLE IF EXISTS persona_draft;
