# Progressive profiling and changing the profile by voice

Spec §6.1.1 step 6, §6.1.2, §6.1.3, §12.7 and §14.2 ("Ask me again"). Decided and built on
2026-11-05.

## What was missing

Onboarding asks only the essentials; the spec asks everything else "at the moment it becomes
relevant". Until now the recordings (6.7) and memory (6.10) switches just sat in the Profile with
a note that the question had not been built, a partner could not change a setting, and a change
made on the Profile could not be undone.

## What was built

### 1. Progressive profiling

`services/api/src/konvami_api/domain/profile_questions.py`. The server decides which question is
due; the app only shows it.

| Question | Due when | Answers | Applied through |
| --- | --- | --- | --- |
| `recordings` | after the first conversation | keep, stop | `RecordingService.configure` (stopping deletes the audio kept) |
| `memory` | a partner has written down a first memory | remember, forget | `MemoryService.configure` |
| `weekly_habit` | after the second conversation | 2 days · 30 min, 3 days · 60 min, 5 days · 90 min a week | `ProfileService.apply` (`weekly_habit`) |

Rules, all in one place so they are tested without a screen:

- A question is asked until it is answered. A setting the learner already chose in the Profile
  counts as answered (the stored field is the proof, so there is no second source of truth).
- At most one question a day (`MIN_GAP`), in the order above.
- "Not now" brings it back once, a week later (`SNOOZE`); a second dismissal is final
  (`MAX_DISMISSALS`). The state is the table `profile_question` (migration 0026).
- Answering applies the setting on the server, validated and logged like any change, then records
  the question as answered. The app never writes the setting itself.

API: `GET /v1/profile/question`, `POST /v1/profile/questions/{id}/answer`, `.../dismiss`.

App: `ProfileQuestion` on Today (`screens/today/profile-question.tsx`), a card in the second
column, after the plan. Options are named by id on the server and worded in the app (four
languages). A question this app version has no words for is not shown, so a newer server never
breaks an older app. After an answer the recordings and memory stores are reset, so the Privacy
and memory screens read the new value.

The reminders offer (device-side, `reminder-offer.tsx`) is a separate prompt and is not counted by
the daily limit; both can be on Today at once. They are in different columns when Today is wide.

### 2. Changing the profile by voice

`domain/profile_voice.py` and the tool `update_profile` in `PracticeTools` (spec §8.4, §12.7).

1. The learner says "explain things in French from now on".
2. The partner repeats it and asks whether that is right (the instructions say so, in a section
   "Changing their settings").
3. On a clear yes it calls `update_profile(field, value, confirmed=true)`. The server refuses a
   call that does not claim confirmation (`not_confirmed`), a field outside the list
   (`not_changeable_by_voice`), and any value `ProfileService` refuses (`invalid_value`, …). It
   cannot hear whether the learner said yes; the confirm step is the partner's, and the server
   only checks that the partner claims it.
4. The change is written with `source = asked` and `origin = voice`, so it is in the log.
5. The tool result carries `from_now_on`, a sentence the partner follows for the rest of the call
   (explanation language and amount), because its instructions were written when the call began
   (spec §12.7 step 4). Other changes matter later and say nothing.
6. The app shows a toast "Explanation language changed · Undo" (`settings-toast.tsx`), from the
   tool's output on the call's data channel (`profileChanges` in the conversation reducer).

Fields open to the voice: `explanation_language`, `explanation_usage`, `exam`, `level_goal`,
`weekly_habit`, `course`. Not open, on purpose: the language learned (it changes the whole app),
the level (the level engine moves it from evidence), and memory and recordings (turning
recordings off deletes audio, and a misheard sentence must not do that; both have a confirm sheet
in the Profile). Objects are merged with what is stored, so "my exam moved to June" sends only the
date and keeps the exam type and level.

### 3. The log and undo

`ChangeRecord` now carries the log's number. `ProfileService.recent(origin)` lists the latest
changes (newest first) with whether each can still be undone; `ProfileService.undo(id)` puts the
setting back as a change of its own (origin `form`, so it is not listed as a voice change).

Only the latest change of a setting can be undone (`superseded`, 409 otherwise): undoing an older
one would also undo the one after it. A change made in the app, or by another learner, is
`not_found`. A setting that had no value before (no exam, no course) goes back to none when it
accepts none, and is `cannot_undo` otherwise.

API: `GET /v1/profile/changes`, `POST /v1/profile/changes/{id}/undo`. App: 6.14 "Changes made by
voice" (`screens/profile/changes.tsx`), a row under Learning on the Profile.

### 4. "Ask me again"

Spec §14.2 describes a button that starts a short spoken re-check of a group. It is a practice
call whose `practise` is `check:<group>` (`learning`: explanation language and amount, course;
`goals`: exam, level goal, weekly goal). `PracticeScript.prepare` recognises the prefix, skips the
Session Planner, and adds a section to the instructions: go through these settings one at a time,
say what each is now, change what is no longer right as above, then end the call. No new endpoint,
call route or server contract was needed: `practise` already travels from the app to the script.
An unknown group is `not_found` (404). The buttons are on 6.3 Learning and start the call with the
partner Today suggests.

## Differences, limits and decisions

- The re-check is a practice call: it counts against the voice minutes, and it also gets a report
  and memories. A call of its own kind, with no report, would need a purpose in the voice broker
  and is a later refinement.
- Undo does not tell the partner. After an undo in the call, the partner goes on as it was asked
  for the rest of that call; the setting is back for the next one.
- Only the settings that exist can be asked about or re-checked. Spec groups with nothing behind
  them (rhythm times, accents, pen-pal, hands-free, display) are not asked.
- "Learned from your sessions" suggestions (spec §6.1.3, AI-suggested updates) and the 2–3 month
  review prompt are not built; they need something that infers a change.

## Tests

- `tests/domain/test_profile_voice.py`, `test_profile_questions.py`, `tests/api/test_profile_api.py`,
  repository tests in `tests/persistence/test_repositories.py` (memory and PostgreSQL).
- App: `voice/conversation.test.ts` (the reducer), `profile/changes.test.ts`,
  `screens/today` (the question card), `screens/profile/changes.test.tsx`, `learning.test.tsx`
  (Ask me again), `screens/conversation` (the toast and its Undo).
