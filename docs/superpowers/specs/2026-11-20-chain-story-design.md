# The story chain, Kettengeschichte (section 9)

Design note, 2026-11-20. The concept is Concept C of `docs/research/2026-11-20-social-concept.md`
(§2, with the anxiety research of §1.3, the rules of §1.4 and the safety design of §3.9). This
note records what is built and the calls made while building it ("my call").

## What it is

Four seats, all learners of the same language, build an audio story together. A story is eight
lines: twice round the table. Each seat hears only the line before its own and the narrator's
one-sentence summary of the story so far, then records one line of at most 45 seconds. When the
eighth line is in, the story is revealed to everyone as a radio play: the narrator's opening, the
eight lines in order, the narrator's short links after the lines that retell what a line meant in
correct language (so a mistake never breaks the story), and an ending. The learner's corrections
stay private (9.7).

## Who plays

- **Every learner** with three AI characters (Lena, Max, Pia in German; Ruby, Finn, Maya; Léa,
  Hugo, Inès; Sofia, Luca, Marta), always shown with the AI chip.
- **Adults** also with friends who redeem the story's code, and with their Two Halves duos (the
  concept's "season finale for two duos": a host may seat up to three people, duos directly).
- **No strangers** (my call: the same reason as Two Halves phase 1, the legal review of §3.12).
- **Minors** (16–17, or an unknown age group) play with AI characters only. The age band is read
  from the sign-up age group each time it matters, never from a stored flag.
- Everyone at the table learns the same language: a code from a story in another language is
  refused calmly (`no_shared_language`).
- Switch: `KONVAMI_CHAIN` (`{"enabled": true, "open_to_testers": false}`), off unless enabled,
  the same seam as `KONVAMI_HALVES`; while not open to testers only the owners play.

## Screens (section 9, pink)

| # | Screen | |
| --- | --- | --- |
| 9.1 | Story chain | The learner's stories, their turn first; how far each chain is (four seats, eight beads); Start a story; I have a code. Reached from a row on Talk (5.2) |
| 9.2 | Join | What the other players hear, the voice-sharing consent (`chain_voice` v1), Veil by default |
| 9.3 | A new story | The opening (six genres, or "Surprise me") as `OptionCard`s; seats 2–4: an AI character, a friend with a code, or a duo |
| 9.4 | Your line | The line before (listen first; its words behind a tap), the narrator's summary, record (45 s), listen back, record again, Veil for this line, send; the main action pinned |
| 9.5 | The story so far | The table with the seat whose turn it is breathing, the beads lit line by line, what the learner heard and said, held lines, invite and "Start now with AI characters" for the host |
| 9.6 | The radio play | A `Pop` and a burst, the playlist player (part by part, captions off until wanted), the four reaction cards |
| 9.7 | My lines, privately | Each own line with its corrections (the 5.10 `PolishCard`), "Say it better" (the 5.10 sheet) and "Keep as a card", only for confirmed corrections |
| 9.8 | Settings | Veil default, pause, another codename, blocked players, delete my story-chain data |
| 9.9 | Invite and take a seat | The story's code to share; the field for a friend's code |
| 9.10 | Report | The Two Halves report sheet (shared `components/report-sheet.tsx`), with blocking |
| 9.11 | Owner's queue | A section of 6.15, as Two Halves' (shared `SocialQueue`) |
| 9.12 | Today | A row on Today when a story waits for the learner's line |

_Colour (my call):_ **pink**, the family of stories and words (5.29 Listening stories is pink): the
chain is a story told and listened to, not a call. The learner's own lines are lime bubbles, the
narrator's on ink, other players' on paper with an ink outline; lines in the language learned are
in the serif italic.

_Motion:_ the seats `Pop` in one after another, the seat whose turn it is breathes (a `Loop`), the
eight beads light up in a stagger as if the chain were being linked, the learner's turn is a pink
tile that pops, and the radio play opens with the celebration burst. Reduce Motion keeps fades
only (the shared blocks).

## Calls made

- **Eight lines, strict turns** (my call): two rounds of four is about four minutes of radio play
  with the links, and each learner speaks twice. Turns go round the table; line _n_ is seat
  ((_n_ − 1) mod 4) + 1.
- **What a seat hears** (the concept): the line before each of its own lines (and before its
  turn), the narrator's summary, and everything once the story is done. The server enforces it on
  every audio address (`_may_hear`).
- **Openings are hand-written** (my call, as Two Halves' cases): six genres in four languages
  with an opening and an ending, so a story can start and end without a model and the opening is
  never wrong. The narrator (the small text model) writes the summaries, the AI characters' lines
  and the links; without a model, AI characters say lines that fit any story (eight per language,
  hand-written) and the radio play has the opening and the ending.
- **Everything the narrator writes is moderated** before other learners hear it: local rules
  plus the moderation provider; a flagged or uncheckable text falls back to the hand-written one
  (fail closed). Added after a security review.
- **The check of a learner's line** is Two Halves' (`halves_check.check_spoken`, with the story as
  the task): local rules, moderation, the on-task classifier; held lines never reach anyone and go
  to the owner's queue; a provider that cannot answer leaves the line waiting, then it fails.
  Story events may be dramatic (a theft, a ghost) but not graphic.
- **A held line stays in the owner's queue** whatever its speaker does (records again, leaves,
  deletes their data); only the owner's decision removes it.
- **Timeouts** (my call): a seat that has had its turn for 48 hours, or a friend's seat nobody
  took, is taken over by an AI character (the hourly tick), so a story never stalls; the host can
  also start at once with AI characters in the empty seats.
- **Blocking** takes the blocked learner out of the story: an AI takes their seat, they cannot
  open it, they are not told of it and do not get its radio play; they keep only the lines they
  recorded themselves. Duos who blocked each other are never seated together. A host taken out by
  a block is host no more. Blocks, duos and the daily cap on wrong codes are Two Halves' own
  tables: one social list across both games.
- **Reactions** are four fixed cards (laughed, surprised, loved, again), counted, one per learner.
  No messages between players.
- **Private corrections** are the report pipeline for one line (`private_corrections`, at most
  three, the second check marks "Not sure"). "Say it better" and cards only on confirmed ones;
  "Say it better" tries count against a daily cap of their own (100).
- **Data**: migration 0320 (`chain_*` tables). A learner's lines and their veiled sounds are under
  `chain/<learner>/` (deleted with the account); the narrator's and AI characters' sounds under
  `chain/stories/<story>/`. The media bucket deletes anything under `chain/` after 30 days
  (`infra/modules/media`, not applied); the API clears a line's words and sounds 30 days after the
  story ends and wipes the radio play then. The radio play stores line ids only; forgetting a line
  also forgets the narrator's link to it, the summaries after it and the ending (the hand-written
  one stands in). The export holds the learner's own rows and their stories without the other
  players' reactions.
- **Costs**: `chain_listen` (a line written down), `chain` (checks, narrator), `chain_audio`
  (veiled lines, AI characters, narrator), on 6.12. The narrator's requests are the host's, or the
  first player's still there.
- **Push**: "It's your turn", "Your line wasn't sent", "A seat for you", "Your radio play is
  ready"; each opens the story.

## Not built

- Strangers, matching and the minor band with friends (Two Halves phase 2 and 3 rules apply).
- An audio classifier: only the words of a line are checked (Veil closes the gap for those who use
  it).
- A downloadable radio play, a share card, and seasons.

## What needs the owner

- Apply the Terraform change (`delete-chain-audio` lifecycle rule) after `terraform plan`, and set
  `KONVAMI_CHAIN` for the API.
- The privacy policy and store labels: the story chain shares a learner's voice with up to three
  friends (as Two Halves does with one); the legal review of §3.12 covers both.
- Deciding held lines and reports on 6.15 within a day.

## Not verified

- No real model, moderation, speech or transcription provider was called; tests use fakes.
- Audio playback and the share sheet on a device.
