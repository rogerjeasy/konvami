-- Vocabulary is evidence from turns, not a count of saved cards (§6.7).
CREATE TABLE IF NOT EXISTS vocabulary_scan (
    call_id text PRIMARY KEY REFERENCES voice_session (call_id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    claimed_at timestamptz NOT NULL,
    attempts integer NOT NULL DEFAULT 1,
    complete boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS vocabulary_evidence (
    call_id text NOT NULL REFERENCES vocabulary_scan (call_id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    language text NOT NULL,
    word_key text NOT NULL,
    word text NOT NULL,
    heard text,
    produced text,
    CHECK (heard IS NOT NULL OR produced IS NOT NULL),
    PRIMARY KEY (call_id, word_key)
);
CREATE INDEX IF NOT EXISTS vocabulary_evidence_learner_idx
    ON vocabulary_evidence (user_id, language, word_key);
