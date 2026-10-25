# Voice review and review conversations (5.7, 5.11, 5.3, spec §6.7)

Status: built (2026-10-25), stacked on the rich-cards branch. Built without a round of questions
(Phase 2, "maximise the learning benefit"); every choice below is mine.

## Why

Turning a card over trains recognition: the learner sees "der Termin" and recalls "appointment".
Speaking needs the other direction, recalling the German word and saying it, which is what a
learner needs in a real conversation. Spec §6.7 names two review formats beyond flip cards:
**voice review** (the app gives the meaning or a cloze sentence, the learner answers in German out
loud) and the **review conversation** (due words woven into a chat, the partner creating
situations where they are needed).

## Voice review (5.11 "Answer out loud")

- **Where:** Learn's review card has "Answer out loud" beside "Review now"; it opens 5.11 with
  `?aloud=1` (`reviewAloudRoute`).
- **What a card asks:**
  - A word card asks the other way round: its meaning large ("job interview"), and its own
    sentence with the word taken out ("Oh, Luzern ist ___!"), from `blankWord` in
    `lib/word-use.ts` (the same word-form rules as the plan strip). A noun with an article asks
    "How do you say it? With its article".
  - A correction card asks as before ("How is it right?", the learner's own sentence); the answer
    is the sentence as it is right.
- **Answering:** "Answer out loud", then Stop (or 20 s pass). `POST /v1/cards/{id}/answers` sends
  the recording; the server writes it down with the verbatim pass (`gpt-4o-transcribe`, told to
  keep mistakes, the model chosen by the 2026-10-25 eval) and compares words, no model's opinion:
  - **right:** the card's words are there, together (a correction: the corrected words are there
    and the wrong ones are not, as in "Say it better");
  - **article:** a noun said without its article or with another one ("Termin", "die Termin"):
    the word is known, its gender not yet. Shown amber, "Almost: say it with its article";
  - **wrong:** anything else, or nothing heard.
- **Rating:** the answer suggests one (right → Good, article → Hard, wrong → Again). The card turns
  over with what was heard, the answer, its forms and Listen; the suggested rating is the primary
  button and is announced as "…, suggested". **The learner still taps the rating** (my call): a
  mishearing must never move a card on its own, and the learner knows whether they hesitated.
- "Show answer" stays available at every step except while recording, so a learner on a bus can
  skip speaking for one card.
- **Limits and cost:** 300 answers a day (`voice_answer_day`, `answer_limit` 429), each metered as
  `voice_review` at least as long as its size says (32 kbit/s floor, as for "Say it better").
  Consent to share audio with the AI provider is checked on every answer.
- The recording is not kept. The rating is stored as any review is (FSRS log).
- **Shared code:** the recording flow is `useSpokenAttempt` (`voice/use-spoken-attempt.ts`) and
  `RecordingNow`, now used by "Say it better" too; on the server `spoken.py`'s `Listener` (format,
  consent, metering, transcription) serves both, and the request body is one `RecordingIn`.

## Review conversations (5.3 with `practise: "words"`)

- **Where:** Learn's review card has "Use them in a conversation" (with the partner Today suggests,
  `useSuggestedPartner`, shared with the grammar topic's "Practise this").
- **Plan:** the call asks to practise `"words"` instead of a grammar topic (one value of the
  existing `practise` field, so no new parameter runs through every call layer). The Session
  Planner then gives up to **6** due word cards (the next ones when none is due), **no grammar
  focus** (the words are the point), and `review: true`.
- **The partner** is told: this conversation is a review; one word at a time, bring the talk to a
  situation where the learner needs it, without saying the word first; if they cannot find it,
  help a little (describe it, give its meaning in their language), let them say it and use it
  again later; never quiz and never list the words.
- **During the call** the plan strip reads "Review: say each word yourself · 2 of 5" and ticks each
  word off as the learner says it.
- **After the call** the worker (`ConversationReview`, between the verbatim pass and the report)
  reads what the learner said (verbatim text first) and counts each plan word they said, in its
  forms (`word_use.py`, the Python twin of the app's `word-use.ts` with the same test cases), as
  a review rated **Good**, if its card was due when the conversation began and has not been
  reviewed since. This holds for **every** practice conversation with plan words, not only review
  conversations (spec §7 "review inside conversation"): a word used in context is a word recalled.
  A word not used is left as it was: not finding a moment for it is not forgetting it.
- Plan words now carry their card id (`PlanWord.card_id`, stored with the plan; not compared, so a
  word is the same word on any card).

## Not built

- The app does not speak the prompt (spec: "the app says the English word"): the cards' sound is
  German, and a voice in the explanation language would be a new cost for little gain. The
  prompt is shown.
- No automatic rating without a tap, no "I said it right" override of the outcome (the learner's
  rating already overrides it), no streaks or speed bonus.
- Review conversations do not show on 5.4 which cards were counted as reviewed; Learn's due count
  shows the effect. A line on 5.4 would need the worker to finish first.
- The word-form rules exist twice (TypeScript for the live strip and the cloze, Python for the
  credit). They are small and share their test cases; a language pack served to the app would
  remove the copy once a second language exists.
