# Two Halves, phase 1 (section 7)

Design note, 2026-11-20. The concept, its research and the later phases are in
`docs/research/2026-11-20-social-concept.md`. This note records what phase 1 builds and the calls
made while building it ("my call").

## What it is

A voice mystery for two, split by language. Each seat holds three of a case's six clues. In each
round a seat tells the other one clue by voice, in the language it is learning; the listener hears
it (for them the easier language, in mirror mode) and proves it got through by answering a question
about it on the board. After three rounds each, both answer the case's question, which needs both
halves. The learner's own partner rehearses the clue with them (the briefing, 7.5) and corrects
their moves privately (7.9): the other player only hears the attempt.

## Phase 1 scope

- **Who plays:** every learner against an **AI stand-in**, always shown with the AI chip; adults
  also with a **friend they invite by code**, and again with a **duo** (two "play again" yeses).
  No stranger ever hears a stranger. Minors (16–17, or an unknown age group) play the AI only.
- **Switch:** `KONVAMI_HALVES` (`{"enabled": true, "open_to_testers": false}`): off unless enabled;
  while not open to testers only the owners (`costs.owners`) play. Same seam as premium voices.
- **Screens:** 7.1 hub (with the start choices of 7.3: AI, this week's case, a friend, a duo),
  7.2 join, 7.4 case board with its end 7.8, 7.5 briefing (a practice call), 7.6 record, 7.7 a move
  heard with the 7.10 report sheet, 7.9 private notes, 7.11 settings, 7.12 invite. The owner's
  queue is a section of 6.15.
- **Left for phase 2:** stranger matching (needs the legal review and the owner moderating),
  native nudges, the strand map, the minor band with a friend. 7.3 "finding a partner" exists only
  as the start choices, since nothing is matched yet.

## Calls made

- **Content:** six hand-written cases (_The Lost Cello_, _Grandma's Recipe_, _The Missed
  Connection_, _The Flatshare Key_, _The Museum Postcard_, _The Wrong Parcel_) in all four
  languages, so every pair works (DE⇄FR, DE⇄IT, DE⇄EN, FR⇄EN) and same-language mode too. Answer
  options are neutral (times, numbers, names) where possible. No AI case writer yet: the wording is
  A2–B1 and the partner adapts it in the briefing. _(my call: a hand-written clue cannot be wrong.)_
- **Rounds:** a seat records round r once it is done with the other's clue of round r − 1, so the
  two go forward together without strict turns. "Done" is answered right, two wrong answers (then
  the answer is shown), or reported. The case question has two tries per seat.
- **Mirror or same-language:** against the AI, the stand-in speaks the learner's first language when
  that is one of the four and not the one they learn; otherwise both speak the learned language.
  Two friends may play only if each can follow the other (each knows the language the other speaks:
  first language or the one they learn); otherwise `no_shared_language`.
- **The check (fails closed):** the move is written down word for word when it is uploaded; the
  worker then runs local rules (instructions to the model, links, contact details, handles), the
  moderation provider, and an on-task check by the small text model (`romance`,
  `contact_or_meetup`, `personal_probe`, `harassment`, `self_harm` hold a move; for minors
  `off_task` too). A provider that cannot answer leaves the move waiting; after three attempts it
  fails and is never delivered. `self_harm` shows the learner a care note.
- **Held moves are never delivered later:** the learner records the round again, and the owner
  only removes (a strike) or dismisses. _(my call: a delayed delivery of a held move would surprise
  both players; three strikes suspend Two Halves for that learner.)_
- **Veil:** on by default (a join choice), per move changeable. The neutral voice reads the
  learner's exact words; if it cannot be made, the move waits like an unchecked one: the raw voice
  is never sent instead.
- **AI stand-in:** names and voices per language (Jonas, Sam, Julien, Giulia), never the learner's
  own partner's voice. It answers a learner's clue from the words alone (the small model; without a
  model, by the options' words and numbers) and says its own clue reworded, keeping every number,
  or as written.
- **Private corrections:** the report pipeline for one move (at most three, the second check marks
  "Not sure"), shown only to the speaker.
- **Recap:** a short scene in the language each learner speaks, voiced by the two characters (each
  learner's own partner, or the stand-in); the case's own ending when no model answers.
- **Briefing:** a practice call whose scenario is `halves:<case as 32 hex digits>`; the practice
  script resolves it into a role-play of the learner's own partner coaching the next clue
  (`PracticeScript(extra_scenarios=…)`). Only the learner's own open case resolves.
- **Data:** migration 0290 (`halves_*` tables). Moves carry the learner's id with ON DELETE CASCADE;
  a seat keeps the case going with ON DELETE SET NULL and an AI finishes it. Audio is under
  `halves/<learner>/` (deleted with the account) and the bucket deletes anything under `halves/`
  after 30 days; the API also clears a move's words and sound 30 days after its case ends. The
  learner's own rows are in the data export, never the other player's moves.
- **Access:** every route is under `/v1/halves` behind the sign-in and the deleted-account guard;
  a case or a move is only reachable through the learner's own seat (tests cover another learner's
  ids and every route without sign-in).
- **Push:** "A new clue arrived" and "Your move wasn't sent" open the case.
- **Invite codes:** ten characters from a cryptographic source (`secrets`, about 49 bits), never
  the game's own random source, which picks codenames and cases. A learner may try ten wrong codes
  a day (`halves_redeem_day`, migration 0291); after that every code is refused with a calm
  "try again tomorrow" (`limit`) until the next day, so a code cannot be guessed. Added after an
  automated security review found six characters from `random.Random` and no cap on guesses.

## What needs the owner

See the release checklist, section H: apply the Terraform and switch it on, a support email,
deciding held moves and reports within a day, the legal review before phase 2, the store forms for
user content, and a second moderator before the minor band.

## Not verified

- No real model, moderation, speech or transcription provider was called; tests use fakes.
- The briefing call was not tried with the realtime model.
- Native share sheet and audio playback on a device.
