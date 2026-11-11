# Learning assessment implementation plan

**Goal:** Complete the grammar, adaptation, pronunciation and exam features requested in spec §§6.8–6.15.
**Architecture:** Extend the existing domain services and language-pack configuration; keep provider assessments behind interfaces. Reuse the existing map, topic, drill and exam screens. Every external assessment remains explicitly unavailable until configured and consented.
**Verification:** Test each behavior before implementation; run domain/API tests, Ruff, mypy, generated-client checks and mobile behavior/visual checks before integration.

## Independently reviewable work

- [ ] Curated grammar reference retrieval over language-pack rules and examples.
- [ ] Tutor grounding in retrieved references, preserving uncertainty.
- [ ] Topic reference rules in the API and screen.
- [ ] Deterministic cloze practice from curated examples.
- [ ] Sentence-building exercises with duplicate-token handling.
- [ ] Quick-quiz screen with local feedback, separate from conversational mastery.
- [ ] Reference search in the map.
- [ ] Audio-derived fluency metrics from real timing evidence.
- [ ] Conservative adaptation signals with minimum evidence and manual override.
- [ ] Per-skill trends without inventing listening/phoneme measurements.
- [ ] Dedicated pronunciation provider contract with score validation.
- [ ] Configured provider integration, consent and unavailable states.
- [ ] Conversation problem-word collection using confirmed assessment evidence.
- [ ] TestDaF speaking formats verified against official references.
- [ ] ÖSD speaking formats verified against official references.
- [ ] Exam task phrase banks and practice entry points.
- [ ] Real picture prompt presentation and source attribution.
- [ ] Scoring and multiple-speaker integration after live-call transport support exists.

## Boundaries

Language packs are owned by the languages workstream. Shared API/schema and locale changes require reservation with the parent. Generated client and commits are serialized by the parent. No deployment, new third-party consent, or fake pronunciation scores.
