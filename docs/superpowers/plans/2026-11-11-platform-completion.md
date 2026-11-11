# Learning platform completion

**Goal:** Implement the eleven requested feature areas using the existing application patterns.
**Spec:** `../specs/2026-10-06-language-companion-app-design.md`, sections 6, 9, 10, 13 and 15.
**Architecture:** Extend domain services behind provider and repository interfaces. Keep mobile routes thin, reuse screens/components/stores and regenerate the API client after coordinated API changes. Account isolation, consent and server quotas apply to every new path.
**Execution:** Four parallel owners; root serializes shared integration and commits. Existing approved product decisions apply. Camera capture and background audio are authorized by the current request. No deployment is included.

## Verification and commit rules

Each deliverable gets a failing behavior test before implementation, targeted checks afterwards and review before staging explicit files. Keep relevant tests with implementation. Commit messages use conventional prefixes and spec references, without attribution trailers. At least 50 meaningful commits are requested; unfinished scaffolding and empty commits do not count as delivered features.

Full validation includes Python tests/Ruff/mypy, mobile and package tests, typecheck/lint, secret checks, generated-client consistency and Terraform validation. Changed screens require five viewport sizes in both themes. Real credentials, native builds or external services required for verification must be reported distinctly from implementation gaps.

## Planned deliverables

- [ ] 1–12: English, French and Italian grammar, vocabulary rules, pronunciation and scenario/persona packs; catalog activation and multilingual regression coverage. Owner: languages; detailed plan alongside this file.
- [ ] 13–27: Account-scoped offline cache, review outbox, idempotent replay, offline deck/review UI, download manager, pin controls, cached library, search, filters, bookmarks, notes, playback rate, transcript timing, text exports and audio exports. Owner: offline_library.
- [ ] 28–43: Curated reference retrieval, quizzes, transformations, sentence building, lesson integration, fluency extraction, vocabulary bands, comprehension signals, adaptive feedback, pronunciation provider, word collection, waveform comparison, TestDaF, ÖSD, picture prompts and exam phrase banks. Owner: learning.
- [ ] 44: Premium voice entitlement enforcement and runtime wiring.
- [ ] 45: Manual phrase entry.
- [ ] 46: Phrase playback.
- [ ] 47: Phrase grouping.
- [ ] 48: Anki-compatible deck export.
- [ ] 49: Active/passive vocabulary evidence.
- [ ] 50: Push-to-talk transport and controls.
- [ ] 51: Revealable captions.
- [ ] 52: Caption word lookup and saving.
- [ ] 53: Call recovery.
- [ ] 54: Hands-free audio lifecycle.
- [ ] 55: PDF imports.
- [ ] 56: Audio imports.
- [ ] 57: Camera imports.
- [ ] 58: Written reply drafting.
- [ ] 59: Premium live voice transport.
- [ ] 60: Integrated regression and documentation reconciliation.

## Review focus

- Offline work must never cross accounts; deletion/sign-out must invalidate cached private data.
- Replaying a review must not apply scheduling twice or overwrite a later review silently.
- A disconnected call must not leak a microphone, duplicate spending or silently change identity.
- Consent withdrawal and expired subscriptions must stop paid-provider access server-side.
- Unsupported languages, unavailable scoring and missing timestamps must be explicit; never fabricate measurements.
