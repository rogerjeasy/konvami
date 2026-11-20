# Two Halves, phase 2 and the owner-free parts of phase 3 (section 7)

Design note, 2026-11-20. Builds on phase 1 (`2026-11-20-two-halves-design.md`) and the concept
(`docs/research/2026-11-20-social-concept.md`, §3.3, §3.5–3.11, §4). Decisions made while
building it are marked "my call".

## What is added

| Screen | What it does |
| --- | --- |
| 7.3 Finding a partner | Looks for a stranger for 2 to 48 hours (a `Stepper`, 12 by default), with a push when someone is found; "Play now with an AI" at any time; the two halves drift towards each other while it looks (`Loop`, still with Reduce Motion). The hub shows a running search as a card. |
| 7.7 A move heard | Captions on request; the **Bridge** in same-language mode (7.18); "Suggest a better way" for a native (7.13). |
| 7.8 Case solved | "Understood the first time" (7.19); a `Celebration` when both said yes and became a duo; the share card (7.15) instead of a text share. |
| 7.9 Private notes | The nudges natives suggested that passed every check. |
| 7.13 Suggest a better way | A sheet with one short phrase (2–120 characters), one per move. |
| 7.14 Strand map | A drawing (react-native-svg, aria-hidden) of a thread from the learner's city to each person they played with, butter for a duo, and the same as a list for screen readers. |
| 7.15 Share card | A picture (ink block, the two halves, the case, "5/6 understood the first time", the invite code), previewed and shared only on request (`shareSvgImage`, as 5.8). |
| 7.16 Owner's numbers | On 6.15: moves, held and reports per 1,000, blocks per 1,000 cases, median hours to a decision, nudges dropped, items waiting; Warn and Suspend beside Remove and Dismiss; held nudges in the queue. |
| 7.17 A case from your course | Pick an import (5.23); the Case Writer turns it into a case against the AI. |
| 7.18 The Bridge | Slower (0.75×, the device's playback rate), then simpler, then the gist in the explanation language, in that order. |
| 7.19 Native intelligibility | "Orion-12 understood 5 of your 6 clues the first time", on the case and (last 30 days) on the hub, private. |
| 5.1 Today | The week's case as one row of the plan, while none was started this week. |

## Calls made

- **Strangers stay off.** Matching is behind `KONVAMI_HALVES.strangers` (default false): the legal
  review of concept §3.12 has not happened. With it off, 7.3 says so calmly and the hub shows no
  "Find a partner". _(my call: build it complete, ship it dark.)_
- **Matching rules** (`domain/halves_match.py`, pure): adults only, a mirror (each learns the
  other's first language) before the same language, the longest waiting first, blocks either way.
  The minor band is never matched (it needs an audio classifier and a second moderator).
- **The age band is read from the account every time** a pair is made, a move is delivered to a
  human, a duo is made or a nudge is allowed, never from the stored profile. A move between two
  learners is held (`age_band`) as soon as one of them is not an adult.
- **The search** is a ticket (`halves_ticket`). The hourly tick pairs who fits, pushes an AI offer
  after 12 hours and ends the search at its time. Playing the AI ends the search. _(my call: the
  search length runs from "now" each time "Keep looking" is pressed; the 12-hour offer counts
  from the first press.)_
- **The Bridge** exists only in same-language mode (in mirror mode the listener hears their own
  language). Each step is written once and kept on the move; what a model writes goes through the
  local rules and the moderation provider first. Without a model, or when it may not be shown,
  "simpler" falls back to the checked move cut into short pieces by code; the gist has no code
  fallback and says so calmly. Bridge text is cleared when the move is forgotten or reported and is
  never shown once the move's words are gone.
- **Native nudges** (free text a stranger types for another learner) pass three gates and fail
  closed: (1) code: a close rewording of the move (at least half its words are the move's), no new
  digits, names (outside German), handles, social-network names or links; (2) the moderation
  provider; (3) the Nudge Verifier on the strong model, told that the players' words are data.
  Wrong or no better: dropped quietly. Anything unsafe, off topic or not a rewording: **held** for
  the owner's queue and never shown. Its writer is not told which. _(my call: hold rather than drop
  what looks like contact, so the owner sees attempts.)_
- **Model-written lines are moderated** (security review): the stand-in's moves fall back to the
  hand-written clue, the recap to the case's ending, a Case Writer case to the word case.
- **Held items stay with the owner.** A learner leaving Two Halves (7.11) keeps their held moves
  and nudges in the queue; the 30-day expiry skips held moves; deleting the account still removes
  everything (erasure).
- **Owner decisions**: remove (a strike; three suspend), warn (a push in fixed words, no strike),
  suspend (at once), dismiss. Every decision is a `halves_strike` row, written first and always,
  so it counts even when the learner has left; joining again rebuilds strikes and suspension from
  those rows. A held item is never delivered later (phase 1's call).
- **Duos** were made in phase 1; the case now says `duo` so 7.8 can celebrate it once.
- **The strand map** draws only places people chose to share (a city from the list or a country's
  middle, never finer), no AI stand-ins, nobody blocked; people without a place are counted.
- **The share card** has no voice, none of the learner's words and no codename; an adult's card
  carries an invite code (made when they have none).
- **The week's case in the plan**: the Learning Director asks Two Halves (`suggestion`) and shows
  the season case while the learner has joined, is not paused, has no open case and started none
  this week. It is not counted as speaking minutes. A failure there never breaks the plan.
- **A case from the course** (7.17): the Case Writer (strong model) writes a case in the four
  languages from an import's text and words, at the learner's level; every text is checked by the
  local rules and the moderation provider, failing closed to the **word case**: code puts six of
  the import's words into a case (three a seat; "which two words were both number 1?"), the same
  every time for the same import. Such a case is kept on the case itself (`custom_template`). At
  most three a day. The word case is played in same-language mode, since its words are in the
  language learned.
- **Pushes**: "Someone was found", "An AI can play with you now", "Nobody was free", "A message
  about one of your moves": fixed words, opening the hub (`open: halves` without an id).

## Data (migration 0300)

`halves_ticket`, `halves_nudge` (one per move and writer; `checking`, `passed`, `dropped`,
`held`), `halves_strike` (outlives the profile), `halves_case.custom_template`, mode `match`,
`halves_move.bridge` and `decided_at`. The learner's own search, nudges and strikes are in the data
export.

## Not verified

- No real model, moderation or speech provider was called for phase 2; tests use fakes.
- Push delivery, the share sheet and slow playback on a device.
- The owner's page (6.15) was checked in tests, not in the browser.

## What needs the owner

The legal review before `strangers` is turned on (concept §3.12), someone deciding held moves,
reports and nudges within a day, and the store forms for user content.
