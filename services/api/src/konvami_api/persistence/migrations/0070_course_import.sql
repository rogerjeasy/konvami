-- Course companion and content import (spec §6.17): what a learner brought (a pasted text, a web
-- page, a photographed menu, letter or textbook page) and what the Course agent made of it.
-- The text is what was read, at most a few thousand characters; the photo itself is never kept.
-- analysis holds the summary, the words, the grammar, the hard sentences and, for a letter,
-- what it asks (domain/course_import.py). textbook and chapter name where the material is from.
CREATE TABLE IF NOT EXISTS course_import (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    language text NOT NULL,
    kind text NOT NULL,
    title text NOT NULL,
    source text,
    textbook text,
    chapter text,
    body text NOT NULL,
    analysis jsonb NOT NULL,
    created_at timestamptz NOT NULL
);

-- Imports are listed newest first, per language.
CREATE INDEX IF NOT EXISTS course_import_listed_idx
    ON course_import (user_id, language, created_at DESC);
