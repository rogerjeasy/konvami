# Exam simulations in the weekly plan (5.1, spec §6.12, §6.13)

Status: built (2026-10-25), on top of the Learning Director and the exam centre. Every detail
below is my call.

## Why

The Learning Director planned conversations, role-plays and review conversations, but no
simulations of the learner's speaking test, although spec §6.12 lists them in the weekly plan. A
learner with an exam had to remember the exam centre on their own.

## How many (`services/api` `domain/director.py`)

- **Only for an exam the app simulates:** an exam ahead (its date not passed) whose speaking test
  the language pack has (Goethe A1–B2, telc B1, the DTZ). TestDaF, ÖSD or another exam get no
  simulations, as before.
- **More often as the exam comes closer**, counted from the week's Monday:
  - no simulation yet: **one**, however far the exam ("A first simulation shows where you stand");
  - more than eight weeks away, or no date: **one every second week** (none in a week after one
    with a simulation);
  - the last eight weeks: **one a week**;
  - the last two weeks: **two**, also before any simulation.
- **At most half the week's speaking:** a simulation takes a whole call (the practice call's
  length, ten minutes), so a 20-minute week has room for one and a 10-minute week for none. The
  week still practises, and the voice minutes are never overplanned.
- **None from the exam's day on:** on the day itself only those already done count.
- The other kinds share the calls that are left, as before (an exam goal still gives half of them
  to role-plays).

## Which day

- **Early in the week:** when two kinds are as far behind, a simulation comes first, so the rest
  of the week can work on what it showed.
- **Only in a whole call:** a simulation is only given a piece of the day as long as a call. A
  day whose share is shorter (five minutes a day, every day) is made as long as a simulation on
  the day one is due, and the planned days after it share a little less. A day with two calls
  starts with the short one, as before: "5 min · Review conversation", then "10 min · Exam
  simulation".

## What counts

- A simulation the learner did counts like a conversation: its minutes and its day go into the
  week's numbers ("48 of 40 min this week · 5 of 4 days"). A simulation too short to score is
  not one. They are read from the exam centre (`ExamService.preparation`): the latest few, with
  their length from the call, on the learner's calendar.
- The **weakest part** is the exam centre's: the part with the lowest share over the latest
  scored simulations.

## Today (5.1)

- The plan's row: "10 min · Exam simulation", with "The speaking test of the
  Goethe-Zertifikat B1", or "Weakest lately: Part 2 · Present a topic" once there is a score.
- When a simulation is next, the button is **"Prepare the simulation"** (not "Start with Lena":
  the call is with the examiner) and opens the test's preparation (5.17), where the learner can
  start at once or take the exam's preparation time.
- The exam card says how many simulations the week has and why: "Simulations this week: 1 of
  2 · Your exam is close: two this week", "One every two weeks while your exam is more than two
  months away. The next one is next week.", or "Your weekly goal has no room for one: a
  simulation takes a whole 10-minute call, more than half of it." It names the weakest part and
  opens the exam centre.

## Left out, and why

- **The week does not practise the weakest part between simulations** (for example a role-play
  that is a presentation): the role-plays are everyday situations, not exam tasks.
- **Phrase banks**, TestDaF and ÖSD: as in the exam centre's note.

## Checked

- `services/api`: the pace, the room in the week, the day a simulation lands on, the exam's own
  day, what a simulation adds to the week (on a whole backend), the plan over HTTP; ruff, mypy.
- `apps/mobile`: Today's plan row, button and exam card in every state (Testing Library), tsc,
  ESLint; visual checks with `.playwright-mcp/check/setup23.js` + `all23.js` (four states, the
  exam card scrolled into view) at the five sizes in light and dark, and German and French at
  three sizes.
