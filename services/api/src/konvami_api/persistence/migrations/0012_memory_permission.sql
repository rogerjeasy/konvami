-- A conversation is read for memories only when that was allowed: the row is made, as
-- 'allowed', when the conversation ends with memory on, and the one worker that reads it
-- makes it 'taken'. A conversation without a row is never read: one that ended while memory
-- was off, one from before memory existed, one whose end could not be recorded. started_at is
-- when it was allowed and, once taken, when it was taken. The rows from before this column
-- were all made by a worker taking a conversation.
ALTER TABLE memory_extraction
    ADD COLUMN IF NOT EXISTS state text NOT NULL DEFAULT 'taken'
    CHECK (state IN ('allowed', 'taken'));
