# What a store listing may and may not claim

Written 2026-11-05 from `docs/design/README.md` (what is built and its differences from the design).
Store reviewers compare the listing with the app, and a claim the app cannot back is grounds for
rejection (App Store guideline 2.3, Google Play "Misleading claims"). Re-read this table before every
release and move a row across when its feature ships.

## May be claimed today

| Claim                                                                    | Where it is built                                               |
| ------------------------------------------------------------------------ | --------------------------------------------------------------- |
| Spoken conversations in German with AI partners, always disclosed as AI  | 5.3, `services/api` `domain/practice.py`, `live_call.py`        |
| Partners the learner creates and shapes (name, look, voice, role)        | 6.4 to 6.6 (roles: friend, teacher, exam coach)                 |
| Partners remember things and ask about them later                        | 6.10, 6.11, `domain/memories.py`                                |
| Correction cards while talking, only when the checker is sure            | 5.3, `domain/spotter.py`                                        |
| A report after each conversation; saying a correction again              | 5.10, `domain/reports.py`, `domain/retries.py`                  |
| Role-plays (eight German situations)                                     | 5.13, `domain/scenarios.py`                                     |
| Guided lessons on a grammar topic                                        | 5.15, `domain/planner.py`                                       |
| Phrasebook for a situation the learner describes                         | 5.19, `domain/phrasebook.py`                                    |
| Flashcards with spaced repetition; answering out loud; review by talking | 5.7, 5.11, `domain/fsrs.py`, `domain/voice_review.py`           |
| Ask the Tutor (typed questions)                                          | 5.12, `domain/tutor.py`                                         |
| A grammar map from what the learner actually says                        | 5.14, `domain/grammar_map.py`                                   |
| Simulated speaking tests, scored afterwards as an estimate               | 5.16 to 5.18 (Goethe A1 to B2, telc B1, DTZ), `domain/exams.py` |
| Weekly plan, progress, reminders                                         | 5.1, 5.8, 6.13                                                  |
| App in English, Deutsch, Français, Italiano                              | `apps/mobile/src/i18n`                                          |
| For ages 16 and over                                                     | 2.1 age check                                                   |
| No ads, no tracking, delete the account in the app                       | privacy policy; 6.9                                             |

## Do not claim (not built, or not true yet)

| Do not say                                                    | Why                                                                                                                                  |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Free plan, free trial, subscription, prices, "Plus"/"Pro"     | RevenueCat and the store products do not exist (spec §6.21.2). **The app still shows "7 days of Plus" on 2.7: remove before review** |
| Voice notes from a pen pal                                    | Pen-pal mode is not built (spec §6.16)                                                                                               |
| Pronunciation scoring or a pronunciation lab                  | Not built; the exam score says it does not judge pronunciation                                                                       |
| Animated or lifelike avatars, lip-sync, video characters      | Avatars are drawn portraits (design README, section 4)                                                                               |
| Languages other than German to learn                          | German is the only language pack (spec §13)                                                                                          |
| TestDaF, ÖSD, or any exam body "official" or "certified"      | Only simulations in the style of Goethe, telc and DTZ, simplified to one ten-minute call                                             |
| "Works offline"                                               | Everything needs the network                                                                                                         |
| A promise of a level, a score or a time ("fluent in 30 days") | The app only estimates; reports can miss mistakes                                                                                    |
| "Premium voices", ElevenLabs                                  | Not integrated                                                                                                                       |
| Importing a course, a textbook or a photo of a letter         | Course companion is not built (spec §6.17)                                                                                           |
| A number of free minutes                                      | 60 a week is a testing allowance, not an offer                                                                                       |

## Trademarks

The description names the Goethe-Zertifikat, telc and the DTZ so learners know which tests are
imitated, and says Konvami is not affiliated with them. Naming them as a plain description of what
is simulated is normally allowed, but it is the likeliest part of the listing to be questioned. If a
store asks, remove the names and write "German speaking tests (A1 to B2)". **Never put these names in
the keyword field** (App Store guideline 2.3.7).
