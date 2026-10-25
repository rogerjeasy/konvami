-- The Session Planner (spec §8.2, §8.6): what a practice conversation set out to practise,
-- kept with the call, so that the server's side of it knows the focus while the call goes on.
-- A call from before plans has none.
ALTER TABLE voice_session ADD COLUMN IF NOT EXISTS plan jsonb;
