-- Per-sound pronunciation scores (spec §6.14 P2): the acoustic score of a drill's sound, from the
-- assessment provider's phoneme scores (domain/sound_phonemes.py). Null for a drill that was not
-- assessed, or whose sound is not scored (stress). The lab shows the mean of the last few.

ALTER TABLE pronunciation_drill ADD COLUMN IF NOT EXISTS sound_score real;

CREATE INDEX IF NOT EXISTS pronunciation_drill_scored_idx
    ON pronunciation_drill (user_id, language, sound_id, drilled_at DESC)
    WHERE sound_score IS NOT NULL;
