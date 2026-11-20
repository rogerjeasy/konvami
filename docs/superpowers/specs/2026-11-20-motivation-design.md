# Motivation and fun (spec §6.15, §14.3, §16.3)

Written 2026-11-20. The owner asked that Konvami "stays fun and enjoyable so we retain users"
with "good incentive and motivation strategies". The competitor research
(`docs/research/2026-11-20-competitor-gap-analysis.md` §3 gaps 4, 8, 12, 14 and §4) recommends
what is proven and respectful and rules out what backfires. This note records what was built and
the calls made. Everything below is "my call" unless it cites the spec.

## What is left out, on purpose

No points, XP, leagues, hearts, energy, currencies, paid streak repair, guilt messages, red, or a
counter of what was lost (spec §6.15 "nothing that rewards tapping over speaking", §14.3, §16.3).
Learning by speaking stays the only thing that counts.

## 1. A streak life cannot break (`domain/motivation.py` `speaking_streak`)

- **Any speaking counts:** a practice conversation, a pen-pal reply, a pronunciation drill or a
  "Say it better" try (read from `penpal_note`, `pronunciation_drill` and `retry_attempt`).
- **Rest days never break it:** only the weekdays of the learner's weekly habit
  (`director.planned_weekdays`) are planned; a day the plan leaves free can pass in silence.
  Days before the learner joined were never planned. Today never breaks it while it is open.
- **A repair, once a week, by speaking:** a planned day that went by without speaking is
  repaired by speaking within the two days after it. A second planned day missed before the
  first is repaired ends the run, and so does the window closing. Repairs are counted per week
  (the Monday of the repair day). Nothing is paid and nothing is bought.
- **What the streak counts:** the days the learner spoke in the current run, not calendar days
  in a row. The string stays "{{count}}-day streak".
- **One streak everywhere:** Today (`HomeService(streak=…)`), the end of a conversation, the
  Profile and Progress (`ProgressService(streak=…)`) all show motivation's streak. The old
  calendar streak (`progress.longest_streak`) is gone.
- **How it reads:** Today's butter tile says "A rest day in your plan. Your streak is safe." on a
  free day. With a repair open, a butter card offers "Pick it up with Lena?" and a call: a few
  minutes of speaking by the last day keep the streak. A run that ends is never announced.

## 2. The next level in view (`level_outlook`, the v4 "almost there" step)

From the level engine's own evidence (`levels.py`: the conversations counted since the level was
set, newest first, at most five): "3 of 5 conversations point to B1", and "Your level moves to
B1 once 4 of 5 do." It shows only while at least one conversation points up, never at C2, and
never a level going down (spec §6.9: a step down is announced on the report, not ahead). On
Progress the next step of the CEFR path turns butter; on Today the level card shows the same
line with a butter "Almost there" chip. The v4 README row "No butter 'almost there' step" is
removed.

## 3. Weekly speaking quests (5.27)

- **Three a week,** chosen once on the first look of the week and kept (`weekly_quest`), so they
  do not change under the learner. One comes from the plan (a review conversation or a role-play
  goal, when the plan has them), one from the learner's own material ("Say it better" twice when
  reports have confirmed corrections, use a saved word in a call when words are due, answer a
  voice note when pen-pal is on, catch up with a partner not talked to for two weeks), and one
  always fits (speak on up to three days of the habit, three pronunciation drills, an
  eight-minute conversation). Each group takes turns by ISO week; an empty group gives its place
  to the next.
- **Ticked from what the learner did,** never by tapping: conversations of the week, pen-pal
  replies, drills, right "Say it better" tries, the plan words said in a call
  (`ConversationReview.words_used`).
- **No points.** A quest done is a celebration moment, and a week with all three done is the
  "A week of quests" milestone.
- **Where:** a butter card on Today with the three and the way to 5.27; 5.27 (butter hero,
  "Start" on each open quest leading to where it is done, `lib/quests.ts`).

## 4. Dated milestones and celebrations

- **Twelve milestones:** the eight there were, plus a week of quests, a streak picked up again,
  a level up (the engine moved it up) and a month of speaking (30 days in a run).
- **Dated once** (`milestone_reached`) the first time motivation sees them reached. A learner
  who joined more than a day before milestones were dated gets those already reached written
  down quietly (`backfilled`): no date shown and no celebration, because they are not news.
- **Celebrations:** each quest done and each milestone reached is one moment. Today and 5.27
  show the oldest first, in a sheet: a badge pops in on butter while twelve colour pieces burst
  around it (`components/celebration.tsx`, `motion.burst`), with a success haptic at the same
  moment. Closing it marks it celebrated on the server, so it never shows twice. With Reduce
  Motion the pieces only fade where they land. Never red.

## 5. Monday's fresh start and a respectful win-back

- **Recap,** Monday to Wednesday until closed (closed per week on the device): last week's
  minutes, conversations and days of speaking, quests done, new milestones and the kinds of
  mistake that came up less than the week before, under "New week, new plan."
- **Welcome back,** after seven or more days without speaking: a tomato card from the partner
  talked to last, with what they remember to ask about (a memory's follow-up question, in the
  explanation language), a call, and "Pause reminders for a month". The pause stops the
  server's quiet-week nudge (`reminder_pause`) and the phone's own reminders until it ends;
  "Resume reminders" lifts it.
- **The quiet-week push never carries memory text.** A notification shows on the lock screen
  and passes through Expo, Apple and Google, so it uses fixed words in the phone's language:
  "I have a question for you. Got five minutes?" when the partner remembers something to ask,
  the usual line otherwise. The question itself is shown only inside the app. A follow-up that
  touches a topic the learner put off limits (6.10) is never asked, in the app or anywhere
  (a memory written before the topic was added can still mention it). A test checks that no
  memory text reaches a push. (Decided after a security review, 2026-11-20.)

## 6. Sharing progress (on request only)

"Share my progress" on 5.8 previews a picture (the forest block: minutes spoken, the longest
streak, milestones reached, the level path and the wordmark) and shares it only when the learner
taps Share. It is drawn with react-native-svg (no new native module): on a phone the picture
draws itself to a PNG (`toDataURL`) that goes to the system share sheet and is deleted from the
cache after; on the web it is drawn on a canvas and shared with the browser's share sheet or
downloaded. No name, recording or words of the learner are in it. Then-vs-Now audio is never
shared.

## API and data

- `GET /v1/motivation`, `POST /v1/motivation/celebrated`, `PUT /v1/motivation/reminder-pause`.
- Milestones on Progress carry `reachedAt`.
- Migration `0240_motivation`: `weekly_quest`, `milestone_reached`, `reminder_pause`, all in the
  data export and deleted with the account.

## Not done, or not verified

- The streak and quests read pen-pal replies, drills and "Say it better" tries from their tables;
  a voice-answered card does not count as speaking (its answer is not stored as an event).
- The share picture's PNG on a real phone (`toDataURL` with custom fonts) has not been seen on a
  device; the web path and the preview were checked in tests only.
- Quests are not yet planned around exam simulations (the coach, built in parallel, owns
  suggestions).
