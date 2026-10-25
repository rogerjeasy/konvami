# The exam centre: simulated speaking exams (5.16–5.18, spec §6.13)

Status: built (2026-10-25). Built without a round of questions, as agreed; every choice below is
mine.

## Why

German-specific speaking exams (Goethe, telc, DTZ) have formats general apps do not simulate
(spec §3.3 gap 7). A learner preparing for one needs to rehearse the real parts, under exam
conditions, and to know how close they are to passing.

## Formats (`services/api` `domain/exams.py`)

- **Configuration of the language pack**, like scenarios and the grammar map: Goethe A1, A2, B1
  and B2, telc B1 and the DTZ (A2–B1). Each part has a kind, its task (for the examiner and the
  scorer), its time and two or three prompt cards in German; cards take turns from one
  simulation to the next.
- **Simplified from the handbooks** (my call) so that one candidate does a whole test in one call
  of at most ten minutes (the call worker's limit): 7–9 minutes of speaking.
- **Two-candidate parts** ("plan something together", discussion, feedback on a presentation):
  the examiner also plays the second candidate (my call). A call has one voice; two personas in
  one call (spec "persona ensembles") is P2.
- **Pictures** (DTZ part 2) are described in words on the card.
- **Preparation time** as in the exam (Goethe B1/B2 15 min, telc B1 20 min, none for A1, A2 and
  the DTZ); the learner may start sooner.

## The simulation

- **A call purpose of its own** (`exam`), so a simulation is never a practice conversation: no
  partner memory, no report, no live corrections, not in the library. Its "scenario" is the
  format id (the existing field, so no new parameter runs through every layer). Voice settings
  written before exams give it the practice call's model and length; it costs voice minutes like
  any call and is metered as `voice_exam`.
- **The examiner** ("Frau Becker"; the exam coach's voice if the learner has one, else `sage`) is
  neutral and formal, says "Sie", runs the parts in order and keeps their time, and **does not
  help**: no corrections, hints, translations or praise. Before each part she calls `begin_part`,
  so the app shows that part's card; `end_exam` ends the test.
- **Notes** from the preparation can be opened during the test (in memory only, forgotten when it
  ends), as on the exam's paper.

## Scoring

- After the call the worker (`exam` job) has the **strong text model** score every part by four
  criteria, 0–4 each: task completion, coherence, vocabulary, grammar (spec §6.13 rubric).
  **Pronunciation is not judged** (my call): a transcript cannot show it. A part's share is its
  points out of 16; the total is the parts' mean; 60 % passes.
- With each part: two or three sentences of feedback in the learner's explanation language,
  quoting their own words, and a **model answer** at the exam's level in German, 60–120 words,
  heard in the examiner's voice (spoken once and kept, `sounds.py`).
- **Always labelled an estimate**, never an official score.
- The scorer reads the **live transcript** (gpt-4o-transcribe, told to keep mistakes); the
  verbatim pass and recordings are for practice conversations only. Fewer than three learner
  turns: "too short to score". Three attempts in all; one pending for five minutes counts as lost.
- **Tried with the real model** (2026-10-25, a scripted Goethe B1 simulation by a learner around
  B1, about $0.014): plausible marks (71 %), feedback quoting the learner with the right forms,
  good B1 model answers. It addressed the learner as "vous"; it is now told to use the familiar
  form as the app does (one shared sentence, `familiar_address`, also used by reports and the
  Tutor).

## Screens

- **5.16 Exam centre** (from Learn): the exam in the profile, the speaking tests (the learner's
  own chosen first), the chosen test's parts and times, **readiness** (latest score against the
  pass mark, change since last time, weakest part lately, and a projected date when three or more
  simulations rise steadily; "keep going" otherwise) and past simulations. "Prepare a simulation"
  is pinned.
- **5.17 Preparation**: every part's card, the preparation time counting down, notes; "Start the
  test" pinned. **The test**: the shared call stage, compact (a smaller portrait so the card has
  room), the parts as chips, the current card, the notes.
- **5.18 Score**: followed while it is written (the generic `written-follower.ts`, now shared with
  the weekly check-in); the total against the pass mark, what to work on, and per part its share,
  marks, feedback, card and model answer with Listen. "Another simulation" pinned.

## Left out, and why

- **The weekly plan scheduling simulations** (spec §6.12): built next, on its own; see
  `2026-10-25-plan-exam-simulations-design.md`.
- **Phrase banks per task turned into cards**: a content project with meanings in every
  explanation language.
- **TestDaF and ÖSD**: their task sets need the exam bodies' own material.
- **Recordings and the verbatim pass for exams**: they are built around practice conversations.

## Checked

- `services/api`: tests for the formats, the arithmetic, the service, both stores, the API, the
  worker and the settings; ruff, mypy.
- `apps/mobile`: unit and screen tests (the reducer's exam part, the followers, the four
  screens), tsc, ESLint; visual checks with `.playwright-mcp/check/setup22.js` + `all22.js` at
  the five sizes, light and dark, plus German and French.
