# Adaptive level engine, basic (spec §6.9, P0)

Decided 2026-10-23. The level practice runs at (the profile's `starting_level`) follows how the
learner really does, instead of staying where onboarding put it.

## Rules

- **Evidence.** The report writer (`domain/reports.py`) already reads each practice conversation
  at the learner's level. It now also answers `level_fit`: for grammar, vocabulary and speaking,
  whether the learner was `below`, `at` or `above` that level, or `unclear`. It is never shown.
- **One conversation** points up when at least two skills were above and none below, and down the
  other way round. With two or more skills unclear it does not count.
- **A change** needs five counted conversations since the level last changed, at least four of
  them pointing the same way and none pointing the other (user's decision: five conversations).
  The level moves one step at a time, never above C2 or below A0.
- **The learner's own setting wins.** Any change restarts the count, whether the engine or the
  learner made it. Changing the level in 6.3 Learning is the "make it easier / challenge me"
  override.
- **A step down is automatic**, with a note (user's decision). No confirmation is asked.

## Where it lives

- `domain/levels.py`: the rule (`leaning`, `next_level`) and `LevelService.after_report`. The
  call worker runs it after the report and before the memories (`main.run_worker`). A failure
  in one step does not stop the others.
- The new level is written to `starting_level` as `measured` by the system, so the partner speaks
  at it from the next call through the existing per-level instructions (`domain/practice.py`).
- `level_step` (migration 0017) keeps each step with the conversation that settled it.
- The report (5.10) announces it (`levelStep`). A step up is celebrated in a card that pops in;
  a step down is a plain note. Both offer "Change my level", which opens 6.3 Learning.
- Progress (5.8) shows the level over time under the level card, read from the profile's change
  log (`profile_change`), once the level has moved at least once.

## Left for later (spec §6.9 "full", P1)

Fluency from audio (pace, pauses), vocabulary frequency bands, comprehension signals, the help
buttons and switching languages as evidence, and noticing frustration or boredom during a call.
The partner does not mention a new level by itself.

## Known limits

- The report is marked ready a moment before the engine runs. A report opened in that moment
  shows no step, but Today and Progress already show the new level.
- Two reports written at the same time read the same evidence and could each take a step. Calls
  of one learner do not overlap, so this needs a report asked for again at the same moment.
