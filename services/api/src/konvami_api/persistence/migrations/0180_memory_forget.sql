-- "Forget that" said during a call (spec §6.11; domain/memory_voice.py). A row is what the
-- learner asked to forget, in a few of their words as the partner understood them. The memories
-- it is about are hidden (memory.hidden_by) until the call ends: then they are deleted for good
-- and the row is settled. Deleting an unsettled row is the undo, and brings them back (ON DELETE
-- SET NULL). The words keep what was said in that call out of its memories and are deleted once
-- they were read, or after two days.
CREATE TABLE IF NOT EXISTS memory_forget (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
    about text NOT NULL,
    created_at timestamptz NOT NULL,
    settled_at timestamptz
);

CREATE INDEX IF NOT EXISTS memory_forget_user_idx ON memory_forget (user_id, created_at);

ALTER TABLE memory
    ADD COLUMN IF NOT EXISTS hidden_by uuid REFERENCES memory_forget (id) ON DELETE SET NULL;
