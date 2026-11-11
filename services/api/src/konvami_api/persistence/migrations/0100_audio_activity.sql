-- Energy measurements are nullable: legacy recordings have no inferred pause values.
ALTER TABLE voice_turn ADD COLUMN audio_active_ms integer CHECK (audio_active_ms >= 0);
ALTER TABLE voice_turn ADD COLUMN audio_pause_ms integer CHECK (audio_pause_ms >= 0);
ALTER TABLE voice_turn ADD COLUMN audio_pauses integer CHECK (audio_pauses >= 0);
