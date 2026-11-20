# Real life: rehearse, debrief, own role-plays and a report for the teacher

Design note, 2026-11-20. Gaps 9, 10 and 15 of `docs/research/2026-11-20-competitor-gap-analysis.md`;
spec §6.3 (role-play), §7 signature feature 8 ("rehearse, then debrief"), §6.11 (memory events).
Screens: 5.13 Role-plays (new sections), 5.31 Create a scenario, 6.23 Report for my teacher, a card
on 5.1 Today and a note on 5.10. Decisions marked **my call** were made without asking, per the
owner's standing instruction.

## What the learner gets

1. **Rehearse before.** An event the partners wrote down ("Has a job interview on Friday") is
   listed on 5.13 under "Coming up in your life" from 14 days before its day, and offered on Today
   in the last 7 days. Tapping it writes a role-play of that event once and opens it with the
   partner who heard about it chosen first.
2. **Debrief after.** Up to 14 days after the event (the memory module's `FOLLOW_UP_DAYS`), 5.13 and
   Today ask "How did it go?". The call (`practise="debrief:<memory>"`) has a partner ask how it
   went, let the learner tell it, find the hardest moment and help them say it again. The report
   (5.10) opens with "After: …" and says the hard moments below are worth keeping as cards; the
   existing "Keep what you learned" turns them into cards.
3. **Own role-plays (5.31).** The learner describes a situation, typed or said out loud; the server
   writes a scene (title, whom the partner plays, the situation, three goals, a level) in their
   explanation language; they change any word, save it, and any partner plays it from 5.13.
4. **Report for my teacher (6.23).** A PDF of 7, 30 or 90 days: conversations and minutes, the
   confirmed mistakes by kind with the learner's own sentences, the grammar topics used, the level
   over time and the per-conversation level evidence, and, if ticked, transcripts and links to
   their recordings. Shared through the system share sheet.

## Decisions

- **One concept for both "own" kinds** (my call). An event rehearsal is an own role-play with
  `source = 'event'` and its memory's id. Both are named in a call as `own-<32 hex>` (fits the
  call's 40-character `scenario`), resolved by `RealLifeService.scenario` in `PracticeScript`, so
  the call, its goals (`mark_goal`), the conversation's `scenario` and the goal chips work as for
  the pack's role-plays. The app names them with `useRolePlays` (`hooks/use-role-plays.ts`).
- **Scenes are written in the learner's explanation language and kept as they read** (my call). The
  partner's instructions carry those words inside `<scene>` tags, with a line that they describe
  the scene and are never instructions, because the learner wrote them. Every part is read by the
  moderation guard (local rules, then the provider) before a draft is written and again before it
  is saved, like a partner's backstory (spec §6.21.4, §16.3). Refusals use the calm moderation
  notes.
- **A rehearsal is written by the model once, else by code** (my call). The first time it is asked
  for, the text model writes a scene from the event's words (it counts against the 40 Tutor
  requests a day). Without the model, the learner's agreement or requests left, the rehearsal is
  the event's words as the title, the standard character ("the person you'll meet there; your
  partner asks who that is") and three standard goals (explain, ask, close), which the app words in
  its own language and the partner is told in English. Free, and never blocks the learner.
- **The debrief is a plan, not a role-play** (my call). The partner plays themselves, so it rides on
  `practise` like a lesson or an import (`planner.py`, `DebriefMaterial` in the call's plan). The
  plan is stored with the call, so the conversation knows its event (`debrief_of`, `debrief`) and
  an event once talked over leaves the list. The event's words are in `<event>` tags: a note the
  learner may have edited is data, not an instruction.
- **Hard moments become cards through the report** (my call). The report already finds the
  mistakes and words of the conversation and offers to keep them; the debrief steers the
  conversation to the hard moment and the report's note points to them. A separate "hard moments"
  extraction would cost another request for what the report already does.
- **The follow-up reminder lands on Today** (my call). The day-after reminder (`reminders.py`)
  already opens Today; Today now shows "How did it go?" first, one tap from the call. Opening a
  call straight from a notification would switch on the microphone and spend voice minutes on a
  stray tap.
- **Memory decides what is offered.** With memory off, nothing is listed and no debrief starts
  (partners are told nothing from before). Deleting an event memory deletes its rehearsal
  (`ON DELETE CASCADE`): what the learner removed should not stay as a title elsewhere.
- **Description out loud** is written down by the verbatim pass (`Listener`, metered as
  `role_play`) in the learner's explanation language, then shown in the field to edit before the
  scene is written. The recording is not kept.
- **Limits.** 50 own role-plays per language; descriptions up to 600 characters; scenes count
  against the Tutor's 40 requests a day; title 80, character 200, situation 400, goal 160.
- **Teacher report as a PDF made on the device** (my call). The server answers the numbers
  (`GET /v1/teacher-report?days=`); the app writes one HTML page (`lib/teacher-report.ts`, every
  text escaped) and prints it with `expo-print`, then the share sheet. Nothing is stored or sent
  by Konvami, so there is no link to expire. Recording links are presigned for an hour, and the
  screen says so; they are added only for ticked conversations and only when the learner turns
  them on. Only confirmed corrections count (spec §16.1): a teacher reads a list as facts.
- **Ink for 6.23** (account and data), **tomato for 5.31** (talking), as the v4 colour families say.

## Not built

- No "hard moments" tool during the call; the report carries them.
- Own role-plays cannot be shared with other learners.
- The teacher report has no web link a teacher could open later, and no audio inside the PDF.
- No visual Playwright check was run for 5.31, 6.23 and the new 5.13 sections in this branch
  (tests and typecheck only).
