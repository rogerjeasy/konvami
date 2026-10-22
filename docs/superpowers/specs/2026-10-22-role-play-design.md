# Role-play (5.13, 5.3, 5.4, spec §6.3)

Status: built (2026-10-22); not yet tried in a real call (no OpenAI credit). Built without a
round of questions at the owner's request; every choice here is mine.

## Why

Spec §6.3 lists role-play scenarios as a P0 mode, and signature feature 8 ("real-life rehearsal")
builds on them: practising the bakery, the doctor or a job interview before it happens.

## What

- **Eight German scenarios** in the language pack (`domain/scenarios.py`): bakery (A1), doctor,
  pharmacy, train station (A2), registration office, flat viewing, job interview, complaint
  (B1). Each has the character the partner plays, the situation, a level and three goals.
- **5.13 Role-plays**, from a row on Talk: the scenarios easiest first with their level. One
  opens in a sheet with its situation, its goals and the choice of partner (the learner's own
  partners, with their voice and look), and starts as a call.
- **During the call (5.3):** the goals are chips that tick off as the learner reaches them.
- **After it (5.4):** "Goals reached: 2 of 3", with the chips.

## How

- A practice call can name a `scenario`; the server checks it against the pack of the language
  learned (404 `not_found` otherwise) and keeps it on the call (`voice_session.scenario`).
- The partner's instructions get a role-play section: the character, the situation, begin in
  the scene, the goals, and a `mark_goal` tool to call when one is reached, never telling the
  learner. When every goal is reached the partner closes the scene and offers to try again.
- `mark_goal` answers `{task, reached, goals}`; the app already follows `task` through a call
  (as in the placement test). The goals reached are kept when the call ends
  (`voice_session.goals_reached`) and read with the conversation.
- The app names scenarios and goals in its own strings, by id; the server's English text is for
  the partner only.

## Not in this step

Real-life rehearsal with a debrief (spec §6.3, P1), custom scenarios, regional accents, the
goals in the Session Report, filtering the library by scenario.
