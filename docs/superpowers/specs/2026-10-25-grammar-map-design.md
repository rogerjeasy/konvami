# Grammar map (5.14, 5.15, spec §6.8, §13.2)

Status: built (2026-10-25), stacked on the live-coaching branch (it uses its Session Planner). The
owner asked for Phase 2 to be built without a round of questions, maximising the learning
benefit; every choice below is mine.

## Why

Reports list mistakes, and Progress counts them per week, but nothing told a learner how well
they use a structure: a kind of mistake that stops appearing may be learnt, or simply avoided.
Mastery needs the right uses as much as the wrong ones (spec §6.8: "based on evidence from your
conversations, not just on quizzes"), and the learner needs a way from "I'm weak at this" to
practising it.

## What

- **Topics** (`domain/grammar_topics.py`, part of the language pack): 34 German topics from A1 to
  C1 after spec §13.2, easiest first. Each has its level, the pack's kinds of mistake that are
  mistakes in it (so every structural kind of mistake belongs to a topic), how a partner brings it
  up without naming it (targeted elicitation), and sentences that use it well.
- **Evidence**: the Session Report's analyst also counts, for each topic the learner used, how
  many times (`uses`) and how many of those were wrong (`wrong`): `Report.usage`. Counts that do
  not make sense (an unknown topic, more wrong than uses, a topic twice) are dropped.
- **Mastery** (`domain/grammar_map.py`), from the last 8 conversations that used a topic, each
  older one weighing 0.85 of the next:
  - not started: never used
  - introduced: fewer than 4 uses
  - practising: under 70 % right
  - mostly right: 70 % or more
  - mastered: 90 % or more over at least 10 uses in at least 3 conversations
  - a trend (improving, steady, slipping) compares the newest two conversations with the ones
    before, once there are four, by 15 points.
- **5.14 Grammar map** (Learn's first row): every topic by level, "A2 · your level", a row per
  topic with four mastery steps, its state and "5 of 10 right", and how many topics are mostly
  right or mastered.
- **5.15 Topic page**: the state, the numbers behind it and the trend; "Said well" (the topic's
  examples); "Typical mistakes" (from the grammar notes of its kinds of mistake); "Your mistakes"
  (the learner's own, from their reports, newest first, unconfirmed ones marked "Not sure", each
  leading to its conversation); **Practise this in conversation** (a call with the partner Today
  suggests, whose plan puts the topic first); **Ask the tutor about it** (5.12 with the question
  written in the field, ready to send).

## How

- `POST /v1/voice/calls` takes `practise` (a topic id); the planner puts that topic first, then
  the topics of the recent mistakes. An unknown topic is `404 not_found`.
- **Every focus of a plan is a map topic now (my call).** The planner maps each confirmed
  mistake to its topic (both kinds of Perfekt mistake count for the Perfekt), so a plan, a
  practised topic and the map speak of the same things. A focus point carries its kinds of
  mistake for the Live Error Spotter. The per-note elicitation hints of the live-coaching branch
  moved to the topics.
- `GET /v1/grammar` and `GET /v1/grammar/{topic}`; computed from the last 60 ready reports in the
  language learned, nothing stored apart from the reports.
- Reports written before this have no counts: the map starts filling from the next conversation.

## Not built (later)

- Quizzes, mini-lessons and generated exercises (spec §6.8).
- Audio links on the learner's mistakes (the transcript, 5.6, plays them).
- The planner choosing "practising" topics of the map on its own when there are no recent
  mistakes; the Learning Director (Phase 2) is the natural owner of that.
- The counts are the analyst's, not checked a second time like corrections; the accuracy test
  (`services/api/evals/`) does not measure them yet.
