-- Profile (section 6): the learner's photo and Persona Studio (spec §6.2).

-- Where the learner's photo is stored (a key in the media bucket); null without one.
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS picture_key text;

-- What a persona does for a living, in a few words.
ALTER TABLE persona ADD COLUMN IF NOT EXISTS occupation text NOT NULL DEFAULT '';

-- A persona's own personality and teaching settings (small JSON objects, checked by the domain).
-- An empty object means: as their role does, which is how every starter partner begins.
ALTER TABLE persona ADD COLUMN IF NOT EXISTS personality jsonb NOT NULL DEFAULT '{}';

ALTER TABLE persona ADD COLUMN IF NOT EXISTS teaching jsonb NOT NULL DEFAULT '{}';

-- One row each time a learner has a persona written from a description, for the daily limit.
CREATE TABLE IF NOT EXISTS persona_draft (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS persona_draft_user_idx ON persona_draft (user_id, created_at);
