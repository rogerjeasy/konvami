# Implementation checkpoint

Updated 2026-11-13. This records implementation across the eleven requested areas. It does not
claim that every original requirement is complete or that the work has shipped. No infrastructure
was applied and no store build was published.

## Implemented

- English, French and Italian starter target-language packs, alongside German; UI language stays
  separate. Packs include grammar reference, partners/scenarios and pronunciation contrasts.
- Offline flashcard review with a durable synchronization queue and account-scoped learning cache;
  pinned/downloaded recordings and local notes/bookmarks.
- Push-to-talk, concealed/revealable captions, contextual word lookup/save and walking mode.
  Practice calls can acquire up to two replacement transports within the original deadline,
  retaining captions, goals, partner, mute settings and one allowance/report. A bounded recovery
  status is shown while the replacement data channel becomes ready. Refunds and metering have
  idempotent receipts, and interrupted report handoffs can be retried.
- Library transcript search and filters, playback speed, aligned word highlighting, and per-session
  PDF/TXT/Markdown plus configured MP3/M4A exports.
- Audio pace/pause observations, grounded learner support signals, active/passive vocabulary
  evidence and progress integration.
- Optional provider-backed pronunciation assessment, locally decoded waveform comparison and
  opt-in assessment of saved conversation turns with problem-word practice.
- Searchable grammar reference and exercises; staged TestDaF practice, ÖSD B1 practice, original
  picture/chart prompts, task phrase banks and a separate second-candidate voice.
- Optional per-simulation acoustic assessment, shown separately from transcript rubric grades.
  Real alignment supports long answers; at most six 30-second segments are assessed, with skipped
  coverage disclosed. Temporary exam recordings are released after scoring or failed handoff.
- PDF/audio/camera import, editable letter replies, manual grouped phrases with playback and
  Anki-compatible text export.
- Premium live speech with subscription entitlement checks and explicit opt-ins.

## Remaining scope and operational limits

- Corpus-backed vocabulary frequency is **not connected to runtime adaptation**. The injectable
  frequency-band analyser and tests exist; corpus dependency installation did not complete.
- Starter language content and grammar references are not exhaustive curricula. Support signals
  use explicit learner statements; there is no claim to infer emotion reliably from voice alone.
- Hard transport continuation currently applies to practice calls. Exam/onboarding calls retain
  their existing failure behavior. Reconnection preserves saved completed turns, and a final
  interrupted sentence may need repeating.
- Notes and bookmarks remain local to the device. Pronunciation/prosody availability depends on
  provider language support; missing scores are not invented. Exam estimates are not official marks.
- Provider-dependent features stay unavailable without configuration. Word alignment needs its
  model; encoded exports and exam acoustics need an executable ffmpeg deployment; acoustic
  assessment needs Azure credentials. None of those deployment changes were applied here.
- Native audio/background mode, downloads, sharing, real-provider behavior and reconnecting on
  physical devices still need development/store builds and smoke testing.
- Responsive visual verification is **not complete**. Browser automation repeatedly failed or
  hung; no successful five-size, light/dark visual check is claimed.

## Verification

The final integrated runs passed 2,479 backend tests (including PostgreSQL and local WebSocket
integration), 1,667 mobile tests in 152 suites, and 58 API-client tests. Python mypy checked 303
source files successfully. Backend Ruff lint/format, mobile/API-client typechecks, mobile lint,
secret checks and Terraform validation passed. A new test prop annotation was subsequently
verified by mobile typecheck and its three walking-mode tests; remaining edits were formatting
and documentation. Unit/provider tests do not replace the outstanding visual/hardware checks.

Commits are grouped by feature and layer, with tests beside implementation. Shared-file changes
were staged as explicit hunks where needed. Unrelated local `.claude/` files are excluded.
