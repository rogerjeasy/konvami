-- Recordings (spec §6.6) and the verbatim pass (spec §9.4). audio_key is where a turn's audio
-- is stored (in the media bucket, under the learner's folder) and audio_ms how long it lasts;
-- both are null for a turn without a recording, or once it was deleted. verbatim is the turn
-- written down a second time from its audio after the call, keeping the learner's mistakes.
ALTER TABLE voice_turn ADD COLUMN IF NOT EXISTS audio_key text;
ALTER TABLE voice_turn ADD COLUMN IF NOT EXISTS audio_ms integer;
ALTER TABLE voice_turn ADD COLUMN IF NOT EXISTS verbatim text;
