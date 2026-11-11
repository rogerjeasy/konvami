# Offline learning and recording library implementation plan

> Execute following the existing service/store/provider boundaries, test first. Parent owns integration and commits.

**Goal:** Persistent account-scoped flashcards and transcripts, replay-safe queued reviews, recordings retained explicitly on-device, and practical library navigation and exports (spec §6.6, §10.3).

**Architecture:** A device storage adapter backs a pure offline repository. An API decorator caches successful reads and falls back only on transport failures. Ratings are durably queued before sending and replayed in order with optimistic review versions. Server FSRS remains authoritative; the same formulas schedule locally. Library metadata lives separately from immutable transcripts. Existing screens and shared components expose each capability.

**Constraints:** Four UI languages; existing tokens/components; no guessed word timings; no cross-account cache fallback; never silently discard unsent ratings; never queue authentication or validation failures; no unauthorized server writes; sign-out purges personal device data. Provider integrations remain behind interfaces.

**Review focus:** interrupted persistence, lost HTTP response after committed rating, account changes during a request, remote card removal, malformed cache data.

## Independent deliverables / commit groups

- [ ] 1. Account-scoped durable cache with corruption handling and bounded retention; storage contract tests.
- [ ] 2. Transport-only cached read fallback and online refresh; API behavior tests.
- [ ] 3. Server optimistic review count and client review timestamp validation; duplicate replay tests.
- [ ] 4. FSRS-6 device scheduler matched against server vectors.
- [ ] 5. Durable ordered review outbox with conflict reconciliation and recovery tests.
- [ ] 6. Review integration and pending-sync feedback.
- [ ] 7. Native/web storage adapters and sign-out isolation.
- [ ] 8. Persistent conversation/transcript library.
- [ ] 9. Explicit recording pin/download/remove with failure cleanup and storage bound.
- [ ] 10. Playback speed and single-turn looping.
- [ ] 11. Transcript search and speaker filters.
- [ ] 12. Library query/persona/mode/date filters.
- [ ] 13. Turn bookmarks and notes with persistence.
- [ ] 14. Per-session TXT/Markdown/JSON export and share/download.
- [ ] 15. Actual timestamp playback highlighting, only when timing data is supplied.
- [ ] 16. Integrated behavior, i18n, account-switch tests and responsive visual verification.

PDF and encoded MP3/M4A exports need an actual renderer/encoder; report them incomplete until implemented and verified, never rename WAV bytes to another format.

## Reviewable commit boundaries

Each group includes its tests; shared files need explicit hunks. All paths below are relative to the repository root. No files have been staged by this workstream.

1. `feat(review): accept replay-safe offline ratings (spec §10.3)` — `domain/cards.py` review method, `api/schemas.py` CardMemoryOut/CardOut/ReviewIn, `api/app.py` review handler, client review arguments, `tests/domain/test_offline_review.py`, card API snapshot. Server optimistic revision prevents lost-response duplication.
2. `feat(review): match FSRS scheduling on device (spec §6.7)` — `apps/mobile/src/offline/scheduler.ts` and its tests. Uses the same published parameters and Python-compatible interval rounding.
3. `feat(offline): persist account-scoped learning data (spec §10.3)` — `offline/cache.ts`, cache tests, `device-disk.ts` and `.web.ts`. Serialized account documents reject failed writes.
4. `fix(auth): preserve network failures for offline learning (spec §10.3)` — API client token-refresh error classification and its regression test; no authorization failures fall back to cached data.
5. `feat(offline): cache learning reads and replay queued reviews (spec §10.3)` — `offline/api.ts` and tests. Due projections survive restarts and partial network availability; conflict reconciliation handles lost successful responses.
6. `feat(review): expose pending synchronization (spec §10.3)` — practice index offline wiring, optional offline service, review screen and `offline-status.tsx`. Sign-out flushes first and preserves unsent account-isolated reviews.
7. `feat(library): download and remove offline recordings (spec §6.6)` — `offline/library.ts` pins/local/clear sections, related tests, media adapter download/remove/resolve sections, library tools pin controls, account deletion/recordings settings purge hooks coordinated with root.
8. `feat(library): keep turn bookmarks and notes (spec §6.6)` — annotation methods/tests, NoteEditor, transcript annotation controls and local-only explanation.
9. `feat(library): search stored transcripts with filters (spec §6.6)` — ConversationQuery, SQL/fake repository listed filters, list endpoint/client query arguments, domain search tests and persistence search test. Filters apply before pagination with bound SQL values.
10. `feat(library): add search and filter controls (screen 5.5)` — library store search, library index UI, controls test. Query, partner, conversation mode and date bounds.
11. `feat(library): filter transcript turns (screen 5.6)` — transcript local text/speaker filters and associated integration tests.
12. `feat(library): control recording speed and repeat (spec §6.6)` — usePlayback rate/loop, RecordingTools controls and library behavior tests. Existing ClipPlayer rate support reused.
13. `feat(library): export transcripts as text and PDF (spec §6.6)` — exportTranscript/tests, native Expo Print/Sharing and browser adapters, export buttons. TXT/Markdown/JSON/PDF contain no signed media URLs.
14. `feat(library): align highlights to recorded speech (spec §6.6)` — domain/alignment.py, RecordingService.word_timings, OpenAiTranscription.align, timing schemas/API/client/fake methods, tests, ClipPlayer real progress callback, timed-text and transcript highlight control. Explicit user action and deployment model opt-in; mismatches never guessed.
15. `feat(library): encode complete recording exports (spec §6.6)` — domain/recording_export.py, providers/audio_encoding.py, RecordingService export methods, format/export API/client/fake methods, provider/domain/API tests, media shareAudio and capability-aware MP3/M4A controls. Native ffmpeg binary is an explicit deployment dependency.

Shared support: four-language `i18n/offline-library.ts` and locale root imports should accompany the first UI group and subsequent hunks. Generated OpenAPI/schema should accompany the final API contract group after regeneration. Parent owns dependency/configuration commits and final responsive screenshots.

## Verification evidence and deployment limits

- Device/cache/library/review/i18n/timed-text subset: 70 tests passed before final playback-control additions; rerun final suite before commit.
- API client: 57 tests passed.
- API/domain/provider recording/offline/search subset: 52 tests passed.
- PostgreSQL + memory library-search contract: both passed after granting local test database process access outside the sandbox.
- Actual local ffmpeg produced MP3 (`ID3`) and M4A (`ftyp`) headers from WAV input in provider integration tests.
- Timing requires `RECORDING_ALIGNMENT_MODEL=whisper-1`; absent config reports unavailable. Audio export requires `RECORDING_ENCODER_PATH` pointing to a deployment-supplied ffmpeg with AAC and libmp3lame. No deployment was performed.
- Native download/share/print APIs are typechecked but still need device smoke testing; responsive web/light/dark verification remains coordinated by parent.
- Notes and bookmarks are explicitly device-local. Offline library consists of successfully visited/cached pages and explicitly pinned recordings; it does not silently download the whole account.
