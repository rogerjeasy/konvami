-- Role-play (spec §6.3): the scenario a practice call rehearsed (a language pack's id; null for
-- free conversation) and the goals the learner reached in it, in the scenario's order.
ALTER TABLE voice_session ADD COLUMN IF NOT EXISTS scenario text;
ALTER TABLE voice_session ADD COLUMN IF NOT EXISTS goals_reached jsonb;
