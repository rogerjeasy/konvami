-- The learner's copy of their data (6.19, spec §6.21.3, GDPR art. 15 and 20): one row for each
-- archive made, only so that the number of archives a day can be limited. The archive itself is
-- a file in the media bucket, deleted after a day, and deleted with the account.
CREATE TABLE IF NOT EXISTS data_export (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS data_export_user_idx ON data_export (user_id, created_at);
