# The Learning Director: goals, the weekly plan and the check-in (5.1, 5.8, 6.3, spec §6.12)

Status: built (2026-10-25), stacked on the voice-review branch. The plan was agreed with the
owner on 2026-10-25; the three open questions in it, and every detail below, are my calls.

## Why

Every conversation already has a plan (the Session Planner, spec §8.2), but nothing looked at the
week: how much to practise, in which way, on which grammar, and whether the learner keeps up.
The Learning Director (spec §6.12, §8.3) owns the goals and the week. It feeds the Session
Planner, puts a daily plan on Today, re-plans when the week goes differently, and reports on the
week afterwards.

## Goals (6.3 "Your goals")

- **Three kinds** (my call): a **level by a date** (`level_goal`: a CEFR level, optional date), an
  **exam on a date** (the `exam` field onboarding already asks for, so it fills itself in), and a
  **weekly habit** (`weekly_habit`: 1–7 days, 10–420 minutes in steps of 5).
- **"A 20-minute conversation with no help" is not a goal** (my call): a call lasts at most ten
  minutes (the worker's Lambda limit) and help use is not stored, so it could not be reached or
  measured. The eight-minute milestone on 5.8 stays.
- No habit set: the plan uses **four days of ten minutes** (40 a week), shown as "Suggested" on
  6.3. Nothing is written to the profile on the learner's behalf.
- The goals screen (`/account/goals`) offers days, minutes (20–120), a level above the learner's
  own (or none) and an optional date; it says how many voice minutes a week the learner has.

## The weekly plan (`services/api` `domain/director.py`)

- **Plain code, not a model** (my call, as for the Session Planner): free, instant, the same plan
  for the same week, and tested.
- **The week** runs Monday to Sunday on the learner's calendar. Cards and voice minutes count by
  UTC week, as the allowance does: the two differ by an hour or two on Monday morning.
- **It never plans more speaking than the voice minutes** (my call): the week's minutes are the
  habit's, cut to the weekly allowance (60 during testing; Today says "Planned to fit your 60 voice
  minutes"). Today's share is also cut to the minutes left.
- **The first week** starts on the day the learner finished onboarding: only the planned days from
  then count, with their share of the minutes, and nothing before it is "missed".
- **Planned days** are the habit's days spread over the week (four days: Monday, Tuesday,
  Thursday, Saturday). They decide how the rest of the week is shared and what counts as missed;
  practising on another day counts just the same.
- **Conversations:** the minutes in calls of at most ten minutes (and at least one per planned
  day). One **review conversation** when three or more word cards come due by Sunday (more for
  long weeks and many words). Of the rest, **role-plays** take half for an exam goal, a third for
  living abroad, work, travel or study, a quarter otherwise; free conversations take the rest. The
  next one is always the kind furthest behind its target; once all are met, free conversation.
- **Role-plays** are ones not played yet at the learner's level first, then easier ones, then the
  one played longest ago.
- **Grammar topics:** two or three for the week, chosen from the grammar map **as it stood on
  Monday**, so the week's topics do not change as reports come in: those the learner gets wrong,
  then barely used, then slipping, then the ones of their own level not used yet. Topics below
  their level count as known until a report shows otherwise (my call: a new A2 learner works on
  A2's Perfekt, not on A1's present tense). With a goal above their level (the exam's, or the level
  goal's), the last place goes to a topic of that level.
- **The Session Planner** puts the week's next topic first in every call that names none; the
  topics take turns over the week's conversations (review conversations practise words instead).
  This is how the Director feeds the planner (spec §8.3). It reaches the Live Error Spotter too,
  through the plan's focus.
- **Card target:** every card that comes due by Sunday (at most 140).

## Today (5.1)

- The partner card says what the button starts: "Today · 15 min · 6 cards", then each call
  ("5 min · Review conversation, using the words that are due"; "10 min · Role-play: At the
  doctor's, focus: Dative"). **One button** starts the first: "Start with Lena", or "Continue with
  Lena" once the week has begun. The plan sits under the button, so the button stays on screen on
  a 320 pt phone.
- **Re-planning:** every time Today opens, the rest of the week is worked out again. Why today
  looks as it does is said when it changed: days missed ("You missed Tuesday and Wednesday, so
  today has a little more"), voice minutes running low or used up, today's or the week's plan done
  (then a light extra: a five-minute review or conversation). Nothing is said when on track.
- Nothing planned for today: the button is "Talk with Lena" again.
- The week card shows minutes and days against the plan ("15 of 40 min this week · 2 of 4 days"),
  the week's topics, and "Change my weekly goal".

## Last week's check-in (5.8)

- **Numbers**, counted from what was done like everything on Progress: minutes against the plan
  and the week before, days, conversations (with role-plays and review conversations), cards
  reviewed, the saved words the week's conversations brought and how many of them the learner
  said (read from each conversation's plan and transcript, as the review inside conversation
  reads them; no table of its own), the week's topics and how each moved on the grammar map,
  confirmed mistakes against the week before, and the level when the week began and ended.
- **Words:** three to five sentences from the partner the learner talked to last, in their
  explanation language, written by the small text model (`week` in the text models, gpt-6-luna;
  the memory model when none is set). It is given the numbers, each named for what it is, and the
  topics' English names with their states as words, never the learner's words.
- **Tried with the real model** (2026-10-25; French, English and Italian; a busy and a quiet
  week; about $0.0005 each). The first version read English topic names and state ids back as
  they were ("Le Dative est passé de « practising » à « mostly_correct »") and praised fewer
  mistakes after one short conversation. Now the model is told to name topics as a learner would
  in their language and not to praise fewer mistakes after very little practice; the second run
  had neither problem, and every number it quoted was right. It ends by asking whether this week's plan suits them and pointing to the
  weekly goal.
- **No nightly job** (my call): opening Progress in a new week asks for it
  (`POST /v1/weeks/{week}/review`), the worker writes it (`week_review` job), and the screen
  follows it (`GET /v1/weeks/{week}/review`). Only last week's can be asked for; a week without
  practice has none. Stored in `week_review` with the numbers it was written from. Three attempts
  in all; one pending for five minutes counts as lost.
- **Listen** (my call for now): the words in the partner's voice, spoken once and kept, as card
  sounds are (`domain/sounds.py`, shared with cards). A live two-minute check-in call would spend
  voice minutes every week; it is left for later.
- It needs the learner's agreement to the AI provider (2.5), like reports.

## Left out, and why

- **Exam simulations** in the plan: built afterwards, with the exam centre; see
  `2026-10-25-plan-exam-simulations-design.md`.
- **Reminders and notifications:** there is no push set-up yet (spec §6.18).
- **Changing the plan by voice:** it belongs to the full live session, like changing the profile
  by voice.
- **Pacing towards a level date:** the plan aims at the goal's level but does not yet say whether
  the date is realistic; that needs the full level engine (spec §6.9).

## Checked

- `services/api`: 1,586 tests (domain, both stores, API, worker, settings), ruff, mypy.
- `apps/mobile`: unit and screen tests (Today's plan, goals, Progress check-in, the follower), tsc,
  ESLint; visual checks with `.playwright-mcp/check/setup21.js` + `all21.js` (Today in eight
  states, 6.3, the goals form, the check-in ready and being written) at the five sizes in light
  and dark, and German and French at three sizes.
