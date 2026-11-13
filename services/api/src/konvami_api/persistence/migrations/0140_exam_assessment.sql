-- Per-exam opt-in, never inferred from account-wide live voice consent (spec §6.13).
ALTER TABLE voice_session ADD COLUMN assessment_consent boolean NOT NULL DEFAULT false;
ALTER TABLE voice_session ADD COLUMN assessment_language text;
ALTER TABLE voice_session ADD CONSTRAINT assessment_exam_only
  CHECK (NOT assessment_consent OR (purpose = 'exam' AND assessment_language IS NOT NULL));
