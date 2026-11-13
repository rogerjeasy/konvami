# Exam stages and picture prompts — spec §6.13

Continue existing language-pack, exam service, preparation/card and score patterns. TestDaF
paper-based speaking is seven separate timed tasks. Each task becomes a resumable practice
stage with original practice content and the handbook's preparation/speaking allowance;
existing persisted simulations identify the least-completed stage. These are clearly labelled
practice stages and estimates, not an uninterrupted official examination or a TDN result.

1. Add tests for seven stages/timings, scored-stage progression, a one-answer stage being scored,
   and actual visual prompts.
2. Add curated TestDaF task content and shared stage/visual metadata; use actual chart data for
   graph tasks. Preserve all existing format IDs and records.
3. Wire centre suggestion/progression and single-answer eligibility. Keep examiner tooling owned
   by the parallel voice agent intact.
4. Expose metadata through existing API, render local themed scene pictures/charts and staged
   preparation labels in all four UI languages.
5. Verify domain/API/mobile behavior, type/lint checks and visual sizes via the visual worker.

Focused commits: curated stages; centre progression/scoring; visual prompt data/API; picture and
chart rendering; stage UI/localization. Relevant tests accompany each. Root stages/commits.

Official format references checked 2026-11-12:
- https://www.testdaf.de/de/teilnehmende/der-papierbasierte-testdaf/aufbau-des-papierbasierten-testdaf/
- https://www.testdaf.de/fileadmin/testdaf/downloads/Modelltests_papierbasierter_TestDaF/UEbungspruefung/1_Uebungspruefung_01_Gesamt.pdf
  Speaking task timings, pages41–53 and masterband transcript. Task prep/speaking seconds:
  30/30,60/60,60/90,180/120,120/90,180/120,90/90.

All task scenarios, numbers and illustrations are original practice material; no official
prompt, photograph or graph is reproduced. DTZ scene descriptions remain available to the
examiner and screen reader, with an actual scene rendered for sighted learners.


Implementation and verification update (2026-11-13): functional changes implemented. Persistent
completed-stage counts are scoped to account/language and independent of the history page.
Single-task monologues are scored, but pending/failed/too-short attempts do not advance the
suggestion. The mobile speaking clock starts when the examiner yields and ends the stage at
its allowance; scoring offers the following stage. Existing compact formats retain their IDs.

52 scoped backend domain/API tests, 2 additional visual-prompt HTTP tests and 25 mobile
exam/i18n tests pass. Mobile typecheck and scoped ESLint pass; scoped Ruff and mypy pass.
The full backend domain/API run passed 1,748 tests. Root owns PostgreSQL verification;
parallel visual worker owns the five viewport/light-dark check. These practice stages use
a generic estimated rubric and do not claim an official TDN score. They support the paper
format, not the distinct digital TestDaF task set.
