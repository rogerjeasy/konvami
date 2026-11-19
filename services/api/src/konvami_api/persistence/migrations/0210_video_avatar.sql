-- Realistic video avatars (spec §6.20 P2): the vendor face a learner picked for a partner, and
-- their agreement to the vendor. No row: the partner's drawn portrait. face_id is the vendor's
-- own id, checked against the configured faces when it is used, so a face dropped from the
-- configuration simply stops being used. The agreement names the vendor, so a new vendor needs
-- a new agreement.
CREATE TABLE IF NOT EXISTS video_avatar_choice (
    persona_id uuid PRIMARY KEY REFERENCES persona (id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    face_id text NOT NULL,
    chosen_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS video_avatar_choice_user_idx ON video_avatar_choice (user_id);

CREATE TABLE IF NOT EXISTS video_avatar_consent (
    user_id uuid PRIMARY KEY REFERENCES app_user (id) ON DELETE CASCADE,
    vendor text NOT NULL,
    agreed_at timestamptz NOT NULL
);
