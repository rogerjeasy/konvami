-- Two partners in one conversation (5.24; design note 2026-11-20-two-partners).

-- The second partner of a two-partner practice call. Removing them keeps the conversation.
ALTER TABLE voice_session
    ADD COLUMN IF NOT EXISTS guest_persona_id uuid REFERENCES persona (id) ON DELETE SET NULL;

-- A turn said by the call's second voice: the second partner, or an exam's other candidate.
ALTER TABLE voice_turn ADD COLUMN IF NOT EXISTS guest boolean NOT NULL DEFAULT false;
