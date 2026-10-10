-- Personas (spec §6.2, §11) and the last two onboarding steps.

-- A learner's conversation partners for one language. look is the avatar's parts and colors
-- (a small JSON of names, spec §6.20). position keeps the order they were added in.
CREATE TABLE IF NOT EXISTS persona (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    language text NOT NULL,
    position bigint GENERATED ALWAYS AS IDENTITY,
    role text NOT NULL CHECK (role IN ('buddy', 'teacher', 'exam_coach')),
    name text NOT NULL,
    gender text NOT NULL,
    age integer NOT NULL,
    origin text NOT NULL,
    tagline text,
    backstory text NOT NULL,
    look jsonb NOT NULL,
    voice text NOT NULL
);

CREATE INDEX IF NOT EXISTS persona_user_idx ON persona (user_id, language, position);

ALTER TABLE onboarding ADD COLUMN IF NOT EXISTS partners_confirmed_at timestamptz;

ALTER TABLE onboarding ADD COLUMN IF NOT EXISTS completed_at timestamptz;
