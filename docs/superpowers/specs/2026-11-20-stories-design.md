# Listening stories (5.29) and the commute drill (5.30)

Gaps 6 and 17 of `docs/research/2026-11-20-competitor-gap-analysis.md`: Langua's stories,
Duolingo Stories and DuoRadio give learners something to listen to that is made for them;
Pimsleur proves that a lesson by ear, with no screen, fits a commute. Konvami has the partners,
their voices, the learner's own words and the corrections the reports confirmed, so both are
built from those.

## Stories (5.29)

**What it is.** A series of short listening episodes (about two minutes) per language learned.
Each is a scene told by one of the learner's partners, or every second one a dialogue between two
of them, at the learner's level, using their due and saved words. Each episode goes on from the
last ones (same characters, same places) and ends on a small open question, so there is a reason
to hear the next one. The learner listens with the text hidden, then answers one or two questions
out loud.

**How it is made.**

- `domain/stories.py` (`StoryService`). The small text model (the same as pen-pal notes) writes
  the episode from computed facts only: the level, up to eight of the learner's words
  (`words_to_bring_back`, due ones first), the cast's character sheets, the last three episodes'
  summaries, the learner's off-limits topics (6.10) and, as themes, up to five of the first
  partner's memory notes about what the learner enjoys.
- Every line is spoken in its speaker's voice with the speech model, as a pen-pal note is, and
  kept under `users/<id>/stories/<episode>/` (deleted with the account). Two partners with the
  same voice get distinct ones (`distinct_voice`, 5.24).
- The worker writes it (`{"story": id}`, `LambdaStoryStarter`), as for pen-pal notes: a request
  may not take that long. The app polls every 3 s while an episode is pending.
- Storage: migration `0260_story` (`story_episode`, `story_word`), both in the data export.

**My calls.**

- **The learner is never a character.** The writer is told never to address or describe the
  learner. Memories are passed as "themes", hints and never facts, so the story cannot state
  something wrong about the learner's life (spec §16.1).
- **Content rules in the instructions, no moderation pass.** The text is model output, not the
  learner's, so the moderation check of 6.5/6.6 does not apply. The writer is told to keep to
  everyday content and to skip the off-limits topics.
- **Three a day, one at a time.** Each episode is a text request and one or two minutes of
  speech. A pending episode blocks the next; a failed one does not count against being asked
  for again, but it does count towards the three.
- **Words count as heard only when said and listened to the end.** `words_used` is filtered to
  the words the text really contains (`uses_word`), and they become passive vocabulary
  (`story_word`, counted with conversation evidence in `vocabulary_repository._COUNTS`) only when
  the learner reaches the end. Hearing is exposure, never knowing (§6.7).
- **Answers are checked word for word.** The expected answer is the shortest one (one to four
  words, from the episode). It counts as right when all its words are in what the learner said,
  in any order, so "Er heißt Herr Keller" answers "Herr Keller". No model judges it. A miss is
  "Not quite yet" with the answer shown, never red (spec §14.3). The latest answer per question
  is kept; the recording is not.
- **Text-only fallback.** Without a speech model, an episode is text, shown with the captions on;
  with one, a line that cannot be spoken fails the episode (a story with a gap is not what was
  promised).
- **Player.** Lines play one after the other at 0.75×, 1× or 1.25×. Each line's text is hidden
  until tapped ("Tap to show this line") or the captions switch is on; every word can be looked
  up and saved with the call's caption lookup (`CaptionLookupSheet`). The line being played is
  highlighted.
- **Colour.** Pink, the words family, like the phrasebook and the pronunciation lab.
- **Metering.** `story` (text), `story_audio` (speech) and `story_listen` (answers written down)
  show on 6.12 Costs.

## Commute drill (5.30)

**What it is.** A ten-minute practice call that needs no screen. The partner runs quick rounds:
the meaning of one of the learner's due words, or a sentence they said earlier that a report
corrected; the learner answers out loud; the partner says the right version once and moves on;
missed items come back at the end.

**How it is made.** It reuses the practice call. `practise="drill"` makes the Session Planner
build a `DrillMaterial` plan: up to eight due words (or the next ones) and up to four of the
learner's own sentences with their confirmed correction, newest report first, each once
(`planner.polish_items`). The partner's instructions get a "hands-free drill" section instead of
"Today's plan" and "Worth practising". After the call, the words said count as reviewed exactly
as in a review conversation (`ConversationReview`), and the report, memories and minutes work
unchanged. The route `drillCallRoute` adds `walking=1`, which turns walking mode on once the call
is live, where the phone has it.

**My calls.**

- **Only confirmed corrections are drilled.** One the second check doubted may not be a mistake
  (spec §16.1). A correction the learner flagged on 5.10 is not yet excluded: the report does not
  carry flags (see "Not built").
- **One call kind, not a new purpose.** A drill is a practice call with a plan mode, so cost
  control, the ten-minute limit, recordings and the report all apply as they are.
- **Explicit recasts are fine here.** Unlike free conversation, the drill is the learner's choice
  to be drilled, so the partner says the right version every time; still no lectures.
- **The suggested partner runs it.** 5.30 starts with the partner Today suggests; there is no
  partner picker on this screen.
- **Colour.** Tomato, the talking family.

## Not built

- Episodes generated ahead of time or on a schedule; a push when an episode is ready.
- Listening comprehension feeding the level engine.
- Excluding reported corrections from the drill.
- Audio-ducking or lock-screen controls for stories.
- A real check of the drill on a phone (walking mode needs a development build), and of how
  well the voice model keeps the round structure.
