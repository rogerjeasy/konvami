# Vocabulary evidence and Anki export implementation plan

**Goal:** Show heard-only versus correctly produced tracked vocabulary and export the saved deck (§6.7).
**Architecture:** A dedicated post-report service matches reported/planned vocabulary against actual speaker turns. A bounded existing text-model check confirms learner usage before it becomes active evidence. SQL stores idempotent per-conversation evidence with account and language isolation; CardProgress exposes distinct active and heard-only counts. Anki export reuses authenticated card access and the library sharing adapter.

- [ ] Add deterministic TSV encoding with Anki separator/html/column headers and quoted Unicode fields; test tabs, line breaks, quotes and literal markup.
- [ ] Add authenticated full-deck export service/endpoint/client and Learn action using native/web sharing.
- [ ] Add transcript evidence candidate selection and quote-bound correctness checking; test partner-only exposure, rejected or hallucinated verification and no-consent behavior.
- [ ] Add atomic per-call scan claims and SQL evidence persistence (migration 0110); test idempotency and account/language isolation with repository contracts.
- [ ] Wire post-report work and privacy export/deletion ownership.
- [ ] Add active/heard-only vocabulary counts and all four UI translations with behavior tests.

No claim of total language vocabulary: counts describe tracked words evidenced by actual conversation turns. Silence, a missing model, or an uncertain verification never becomes active knowledge. Export includes card text and notes, not recordings or external media.

Anki file syntax source: https://docs.ankiweb.net/manual/importing/text-files (read 2026-11-11).
