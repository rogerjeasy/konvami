-- Explicit per-call premium voice consent; older calls retain their original transport.
ALTER TABLE voice_session ADD COLUMN premium boolean NOT NULL DEFAULT false;
