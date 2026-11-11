# Additional language packs implementation plan

**Goal:** Make English, French and Italian usable target languages through the existing pack interface (§13).
**Architecture:** Curated grammar references, topic maps, pronunciation drills, word matching and starter partners are configuration; the catalog assembles them. Existing providers, services and screens remain shared.
**Constraints:** German behavior stays intact; no invented exam certification; every sound has four UI translations; every enabled pack has real content. No commits or generated-client changes by this worker.

## Focused delivery groups

- [x] English grammar reference and A1–C2 map, with linked categories and examples.
- [x] French grammar reference and A1–C2 map.
- [x] Italian grammar reference and A1–C2 map.
- [x] English word-use rules and inflection examples.
- [x] French word-use rules and elision examples.
- [x] Italian word-use rules and inflection examples.
- [x] English pronunciation contrasts with translated guidance.
- [x] French pronunciation contrasts with translated guidance.
- [x] Italian pronunciation contrasts with translated guidance.
- [x] Reusable role-play localization without German administrative assumptions.
- [x] English starter partners and voice sample.
- [x] French starter partners and voice sample.
- [x] Italian starter partners and voice sample.
- [x] Catalog activation and onboarding regression tests.
- [x] Mobile grammar labels and multilingual integration (coordinated with root).

Each group follows failing behavior tests, implementation, targeted tests and Ruff. Final validation includes backend domain/API tests and mypy. Check unknown language rejection, no German content leaking into another pack, correct grammatical categories, all four sound explanations, and unchanged German content.


## Verified delivery and commit inventory

Core red tests originally failed 12 missing-language assertions; after implementation 156 backend catalog/profile/word-use/grammar tests passed, 71 card/voice-review/placement tests passed, 3 new-language onboarding flows passed and 16 mobile word-use tests passed. Ruff and scoped mypy pass. Full-suite and device checks remain integration responsibilities. i18n parity temporarily failed for another workstream’s unfinished offlineLibrary translations.

Stage explicit owned files only; locale files contain other workers’ edits, so stage only target-language import/spread, language availability wording and generic word-form labels.

1. `feat: add English grammar reference (§13)` — language_packs/__init__.py, grammar_content.py, english_grammar.py; test_english_grammar_content.py.
2. `feat: add French grammar reference (§13)` — french_grammar.py; test_french_grammar_content.py.
3. `feat: add Italian grammar reference (§13)` — italian_grammar.py; test_italian_grammar_content.py.
4. `feat: recognize multilingual review inflections (§13)` — domain/word_use.py; language_packs/{english,french,italian}_words.py; mobile src/lib/word-use.ts and its test. Integration word-rule assertions are in test_language_packs.py (catalog group).
5. `feat: add English pronunciation drills (§13)` — english_sounds.py; test_english_sound_content.py.
6. `feat: add French pronunciation drills (§13)` — french_sounds.py; test_french_sound_content.py.
7. `feat: add Italian pronunciation drills (§13)` — italian_sounds.py; test_italian_sound_content.py.
8. `feat: add native starter partners and local scenarios (§13)` — language_packs/persona_content.py, {english,french,italian}_personas.py, scenarios.py.
9. `feat: enable English French and Italian learning (§13)` — catalog.py; test_language_packs.py, test_language_onboarding.py; availability assertions in test_profile.py and test_api.py.
10. `feat: render target-language card forms (§13)` — cards.py Article alias only, card_details.py, language_packs/articles.py, test_multilingual_card_details.py, components/word-forms.tsx; generic form-label locale hunks.
11. `feat: assess articles in multilingual voice review (§13)` — voice_review.py; test_multilingual_voice_review.py.
12. `fix: make placement tools target-language neutral (§13)` — placement.py and its test.
13. `feat: localize additional learning pack labels (§13)` — i18n/target-language-labels.ts; locale import/spread and availability hunks.
14. Documentation — this plan and the scoped design note.

No non-German certified exam formats are offered. The new reference maps are curated starter maps (8 topics each), with 3 sound contrasts per language. These are useful content, not a claim of exhaustive language instruction. German remains unchanged except for generic language-safe consumers.
