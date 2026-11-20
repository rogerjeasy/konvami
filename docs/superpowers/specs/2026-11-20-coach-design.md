# The Coach (5.26, Today's coach card)

Written 2026-11-20. Spec §6.12 (Learning Director), §8.2 (agents), §14.3 (UX principles).
The owner asked for "an AI agent that will be looking at the user data or progress or activities,
analyse it and then suggest activities or actions". Decisions marked **my call** were made
without asking, as the owner requested; each says why.

## What it is

One place that turns everything Konvami already knows about the learner into a few suggestions
for what to do next, each with the reason and the evidence behind it, an action that starts with
one tap, and how long it takes. It sits **on top of** what already analyses the learner (the
reports and their confirmed mistakes, the grammar map, the cards, the pronunciation lab, the level
engine, the exam centre, the Learning Director's week, the partners and the imports). It measures
nothing new.

Code: `services/api` `domain/coach.py` (rules, ranking, wording check, service),
`domain/coach_facts.py` (the facts, read from the existing services),
`persistence/coach_repository.py` (migration `0230_coach`); app `screens/coach`,
`screens/today/coach-card.tsx`, `lib/coach.ts`, `practice/services.tsx` (`useCoach`).

## Two halves

1. **Signals, by code** (`find_signals`). Plain rules over numbers, the same every time, free and
   testable. **My call:** a model never decides *what* is true about the learner; it only words
   what code found. That is how the reports already work (a second check), and it is what makes
   "never invent data" enforceable.
2. **Words, by the small text model** (`CoachService.phrase`, the worker's `coach` job). It is
   given the computed facts only (no transcript), picks and orders at most three of the
   candidates and writes a title and a "why" for each, in the explanation language, warm and
   never guilt-tripping. **My call:** any number in its text that the candidate's facts do not
   hold throws the whole answer away (`invented_numbers`), and an urgent candidate must stay
   first; the app's own templates are used instead. Metered as `coach` on 6.12.

The app words a suggestion from its own templates (in the interface language, all four
languages) whenever the model has not: no model configured, the learner has not agreed to the AI
provider (2.5), the month's spend is past its **target** (not only at the ceiling: wording is a
nicety, so it is the first thing to go; **my call**), the model failed, or it is still writing
(`wording: "pending"`, the app reads again every 4 s, 4 times).

## The signals

| Kind | Found when | Action | Score |
| --- | --- | --- | --- |
| `exam_near` | exam ≤ 14 days and no simulation in 7 days (urgent); ≤ 56 days and none in 14; or never simulated | the speaking test's preparation | 90 / 70 |
| `recurring_mistake` | a kind of confirmed mistake in 3 of the last 5 reports | a guided lesson on its topic, else "Say it better" | 60–80 |
| `long_gap` | ≥ 5 days without practice | a 5-minute conversation | 65 |
| `streak_at_risk` | a run of ≥ 3 days, not practised today, after 17:00 | a few cards, else a short talk | 58 |
| `say_it_better` | the last report's confirmed corrections, none said again | 5.10 | 55 |
| `weak_topic` | ≥ 4 uses and < 60 % right (+10 when slipping) | a guided lesson | 50–60 |
| `cards_lapsing` | ≥ 3 due word cards forgotten twice or more | a review conversation | 50 |
| `level_close` | since the level was set, ≥ 2 conversations pointed up, none down, fewer than 5 counted | a conversation | 48 |
| `problem_sound` | < 60 % of ≥ 3 drills right, a score < 70, or ≥ 2 problem words | the sound's drill | 45–55 |
| `review_due` | ≥ 6 word cards due (no lapsing signal) | a review conversation | 45 |
| `cards_overdue` | ≥ 15 due, or due for ≥ 3 days | review up to 20 cards | 40–70 |
| `import_waiting` | an import 1–14 days old | a talk about it | 40 |
| `partner_unvisited` | a partner never met, or not for 21 days, once the learner met another | a conversation with them | 25 |
| `plan_missed` | the week's planned days missed (Director) | none: a finding only | 40 |
| good news | a topic moved up a state in a week; fewer confirmed mistakes than last week (from ≥ 3); pace up ≥ 10 %; the level raised in the last 7 days; the best run of days; ≥ 85 % of ≥ 20 cards remembered | none | 40–70 |

Before a first conversation there is nothing to coach: Today starts one.

**Respectful by design (spec §14.3, my call):** a gap is "five easy minutes are the best way
back", never "you lost your streak"; the streak signal only appears late in the day and never
together with the gap one; trends read "Getting better / About the same / Needs attention" on a
quiet chip, never red. The model's instructions forbid guilt and lost-streak language.

## Ranking and the learner's answers

`rank` keeps the signals that have an action, the urgent first, then by score with what the
learner said: **Start** (accepted) adds 5 per time in the last 30 days (up to 15) to that kind;
**Not now** hides that suggestion for the day; **Not for me** asks why: *not interested* and
*not useful* mute the kind for 30 days, *I already know this* mutes that one thing for good,
*it takes too long* favours suggestions of ≤ 5 minutes for 14 days. One suggestion per kind;
three shown, up to six kept so the next takes the place of one turned down.

A muted kind still shows under "What's holding you back": **my call**, the Coach stops
*suggesting* it, it does not hide the truth.

## The day

The Coach's findings are stored per learner, language and calendar day (`coach_brief`,
`coach_suggestion`), so the suggestions stay put while the learner comes and goes. They are found
again on a new day and after a new report (the brief's `basis` is the latest report). The model
words a day at most 4 times (a new day, then after reports), and never twice at once
(`request_wording`, one atomic statement).

**Outcomes**, for evaluation and for the learner's history: when a later day is found, each
earlier shown suggestion is settled as `resolved` (what it was about is no longer found) or, after
7 days, `persists`; `acted` says whether the learner practised after taking it up.

## Where it shows

- **Today (5.1):** the first open suggestion, under the week's plan. **Which rule decides:** the
  plan's next session stays the main action unless the Coach's first suggestion is **urgent**
  (score ≥ 85: today only an exam within two weeks with no simulation in the last 7 days); then
  the Coach card comes first and its "Start" is the main (ink) button. **My call:** the plan
  already balances the week; the Coach only overrides it for something that cannot wait.
- **5.26 Coach** (ink hero, like the Tutor: asking Konvami what to do next): today's
  suggestions, what's holding you back (top 3 with trend), what's going well (top 3), earlier
  suggestions with what came of them.
- **Reminders (6.13):** on the Coach's day, the day's reminder to practise says "Your coach
  suggests: …" with the first open suggestion. Still at most one reminder a day, at the learner's
  time; quiet hours unchanged.
- **In the call (spec §8.2):** the Session Planner puts the Coach's focus of the day first (the
  topic of a recurring mistake or a weak topic, when it is the first suggestion), before the
  week's next topic, in a call that has no topic of its own.

## Privacy

Nothing new leaves the server except the computed facts to OpenAI, which the learner agreed to
(2.5), and only for learners who did; they include, for a recurring mistake, the learner's own
sentence and its correction, which the reports already send. Both tables are in the data export
(6.19) and are deleted with the account (ON DELETE CASCADE).

## Not built

- The Coach does not schedule anything itself or change the plan; the Director still owns the
  week (spec §6.12). Re-planning by voice stays out (README 5.1).
- No push from the server for a suggestion: reminders are scheduled on the phone.
- Frequency bands, emotion from voice: not read (no corpus; never inferred, README 5.10).
- Suggestion quality has not been evaluated with real learners; the stored outcomes are there to
  do it.
