# Guided lessons (spec §6.3)

Status: built (2026-11-05). Every detail below is my call.

## Why

Spec §6.3 lists the guided lesson as a P0 session mode: 10–15 minutes on one grammar goal, as
"short explanation → examples → you produce → feedback → free use". Until now the learner could
only *practise* a topic (5.15), where the partner steers the talk towards it and never names the
rule. A lesson is the other half: someone teaches the rule first.

## What it is

A lesson is an ordinary practice call (same voice pipeline, report, memories, recordings, live
corrections and costs) whose plan teaches one grammar topic. Nothing new is stored: the call is
started with `practise = "lesson:<topic>"`, and the plan stored with the call says it is a lesson.

- **Planner** (`domain/planner.py`): the topic must exist in the learner's language pack (else
  `GrammarMapError`, as for "Practise this"). The plan is the topic alone: `focus` has that one
  point (with the learner's own mistakes on it, and its mistake categories for the live checks), the
  new `SessionPlan.lesson` (`LessonMaterial`) carries the **rules** (the pack's rule notes for the
  topic's kinds of mistake, `grammar.py`) and the **sentences** (the topic's own, and the notes'
  right and wrong ones). No saved words, no earlier talk, no other topics.
- **Partner instructions** (`domain/practice.py`, `_lesson`): five steps with times, which add up
  to the call: explain (~1 min, in the explanation language), examples (~1), the learner produces
  (~3, one question at a time), feedback (during that step: the right sentence once, naturally,
  said again by the learner; the rule once more after two stumbles) and free use (~3). The partner
  never announces a step. The "Worth practising" and "Today's plan" sections are left out so
  nothing competes. A topic without a rule note (for example "Questions") tells the partner to
  call the Tutor for the rule instead of inventing it.
- **API**: `CallPlanOut.lesson` (bool). `practise` accepts the `lesson:` prefix; its length limit
  already fits the longest topic id.
- **App**: 5.15 gets "Take a short lesson on this" (a secondary button between "Practise this in
  conversation" and the Tutor link); Talk gets a "Guided lessons" row that opens the grammar map,
  where a topic is chosen; 5.3's plan strip says "Lesson: Dative" instead of "Practising today".
  `lessonCallRoute` builds the route.

## Differences from the spec

- **Ten minutes, not 10–15.** A call lasts at most ten minutes (the call worker runs on Lambda),
  so the five steps are timed to fit; the free-use step takes what is left.
- **No lesson record.** The report and the grammar map count the uses and mistakes of the call as
  for any conversation. Conversations do not say they were lessons (that would need a column on
  the conversation; it is not needed yet).
- **No exercises on screen** and no lesson on vocabulary yet: a lesson is a grammar topic of the
  pack's map.
- **The Director does not schedule lessons** yet; the learner starts them from 5.15 or Talk.
