-- Reminders (spec §6.18): for an event still to come, the question its partner asks the day
-- after it ("So, how did the interview go?"), in the learner's explanation language. Written
-- with the memory; null for everything else, and once the learner changed the memory's words.
ALTER TABLE memory ADD COLUMN IF NOT EXISTS ask text;
