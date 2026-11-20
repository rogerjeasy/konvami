# Radio Konvami (section 8)

Design note, 2026-11-20. The concept is Concept B of `docs/research/2026-11-20-social-concept.md`
(§2), with the safety rules of §1.3, §1.4 and §3.9 that apply to a show. This note records what is
built and the calls made while building it ("my call").

## What it is

A short call-in show every day in each language learned, on one everyday question ("What was your
funniest train journey?"). Learners phone in with a voice note of up to 45 seconds. Each call is
written down word for word at once and checked on the server before anyone else hears it. At the
show's hour the host, Mia, screens the calls that passed, picks a few and weaves them into a show:
an opening, a warm line after each caller and a goodbye. AI callers, always labelled AI, fill the
show when there are few. Listeners react with four fixed applause cards and nothing else. Mia never
corrects anyone on air; each caller gets a private report of their own call (8.4) with the
corrections the second check confirmed, "Say it better" and cards.

## Screens

| # | Screen | Route |
| --- | --- | --- |
| 8.1 | Radio Konvami: the show on air, the question on the line now, the learner's calls, Call in (pinned) | `/radio` |
| 8.2 | A show: the playlist with captions, Now playing, applause cards, report | `/radio/episodes/[id]` |
| 8.3 | Call in: the question, the Veil, record (45 s), listen back, record again, send | `/radio/call-in` |
| 8.4 | Your call, privately: what you said (lime bubble), status, corrections, Say it better, keep as a card, take back | `/radio/calls/[id]` |
| 8.5 | Past shows: the last 14 days | `/radio/archive` |
| 8.6 | Radio settings: codename, Veil default, confirmed reports, withdraw and delete my calls | `/radio/settings` |
| 8.7 | Join the show: the voice-sharing consent and the Veil | `/radio/join` |
| 8.8 | The owner's queue, a section of 6.15: held calls and reports; remove, dismiss, take a show off air | `screens/flags/radio-queue.tsx` |

Reached from a row on Talk (5.2) when the show is open, a card on Today when the learner's call aired
in the last two days, and the pushes "Your call is on Radio Konvami today" (opens 8.2) and "Your call
wasn't put through" (opens 8.4).

**Look** _(my call)_: Radio is the talking family, so every screen opens on the tomato block
(`StudioHero`: the studio's "On air" lamp breathing, a small level meter that moves while something
plays). Today's show sits on the ink block with a lime "Listen" button, the "You're on the radio"
moment pops on butter with a burst, and the learner's own words are a lime bubble in the serif
italic. No purple, no gradients. Motion: `Reveal` staggers, `Pop` for an aired call, `Loop`s for the
lamp and meter (off with Reduce Motion).

## Server

- `domain/radio.py` (the show, calls, the build, the owner), `domain/radio_check.py` (models),
  `domain/radio_prompts.py` (12 hand-written prompts in four languages, two fallback AI calls each),
  `api/radio.py` (`/v1/radio`), `persistence/radio_repository.py`, migration `0310_radio.sql`.
- **Shared check** _(my call)_: Two Halves' move check moved to `domain/voice_messages.py`
  (`MessageChecker`): local rules, the moderation provider, an on-task check by the small text model,
  failing closed. Two Halves and Radio each pass a `Setting` (what is on task, the feature charged).
- **The day** _(my call)_: a show airs at 17:00 UTC (18:00 in Zurich in winter) and takes calls until
  then; after it, calls go to the next day's show. The hourly schedule that runs pen-pal notes and
  Two Halves (`nudges`) builds shows whose hour has come, checks lost calls again and deletes what is
  past 30 days. No new AWS resource.
- **Cold start** _(my call)_: the first time anyone opens the show in a language, the day before's
  show is made at once with AI callers only, so there is something to hear on day one. A show is
  only made for a language someone opened, so nothing is spent on a language nobody learns.
- **The build**: the calls that passed are screened by the small text model (best first, at most 4);
  without a model the first ones air. AI callers fill to 3 voices. The host's script is written by
  the model, then moderated as a whole; flagged, unchecked or incomplete, Mia says her own words
  (`fallback_script`). Every line is spoken and stored; a line that cannot be spoken stays as a
  caption, shown for its reading time.
- **A playlist, not a mixed file** _(my call)_: the Lambda runtime has no audio encoder, so a show is
  a list of segments the app plays one after another. Mixing into one file is left for when `ffmpeg`
  is configured (it is offered for transcript export only today).
- **Costs**: `radio_listen` (a call written down, "Say it better"), `radio` (checks, corrections,
  screening, writing), `radio_audio` (the host, AI callers, a veiled call), on 6.12. A show's
  requests are metered to the learner who first opened it _(my call: every request is metered to a
  learner; a show has no single owner)_. Past the month's spend target, a show is put together
  without a model (Mia's own words, the prompt's AI calls).
- **Limits**: 5 calls a day, one live call per show (a new one replaces the earlier), 30 "Say it
  better" tries a day.

## Safety by design

- **Consent** _(my call)_: an adult joins with a consent of its own, `radio_voice` v1 (separate from
  2.5 and from Two Halves), stored on `radio_profile`. Withdrawing it (8.6) deletes the learner's
  calls and takes them out of every show.
- **Adults only on air**: the age band is worked out again from the account at call, check and air
  time, never trusted from the stored profile alone; a minor, an unknown age group or a band that
  differs from the stored one is never aired. A minor may join without the consent, listen, call and
  get their own report: their calls are private practice.
- **The Veil is on by default**: listeners hear a neutral voice reading the caller's exact words. A
  veiled call whose neutral voice cannot be made waits, like an unchecked one; the raw voice is never
  aired instead.
- **A codename only** (made up by the server, re-rolled, never typed); no place, no profile, no
  photo, no free text to other learners. Reactions are four fixed applause cards.
- **Nothing held is aired**: a held or failed call never goes on air. A caller who records again or
  takes a held call back only hides it from themselves; it stays, with its reasons, in the owner's
  queue until decided or 30 days old. Strikes are kept apart from the profile (`radio_strike`), so
  leaving and joining again does not clear them; three close calling in.
- **The host's words are moderated**: everything a model writes for the show (the script, AI calls)
  goes through local rules and the moderation provider before it is spoken, and fails closed.
- **Reports**: on every call (8.2), hidden for the reporter at once; the owner removes (a strike for a
  learner, the segment for an AI line), dismisses, or takes the whole show off air (6.15).
- **Retention**: calls' words and sounds 30 days after the show (API) and anything under `radio/` 30
  days old (bucket lifecycle rule, `infra/modules/media`). Deleting an account deletes the profile,
  calls, applause, reports, strikes and every file under `radio/<learner>/` (veiled sound included;
  `accounts.user_folders` lists every per-user folder and a test checks each is cleared).
- **Data export** (6.19): the learner's own profile, calls, applause, reports, strikes and retry
  counts; never another caller's words.

## Switch

`KONVAMI_RADIO` (`{"enabled": true, "open_to_testers": false}`), off unless enabled; while not open
to testers only the owners (`costs.owners`) listen and call. Terraform: `var.radio` in
`infra/envs/dev`, passed to the API.

## What needs the owner

Apply the Terraform (the `radio/` lifecycle rule and `KONVAMI_RADIO`) and switch it on; the legal
review before strangers hear each other (the same as Two Halves' phase 2: user-to-user voice, DSA
notice and action, the privacy policy); a support address; deciding held calls and reports within a
day; the store forms for user content.

## Not verified

- No real model, moderation, speech or transcription provider was called; tests use fakes.
- Audio playback of a show on a device; the web check plays a stand-in.
- The bucket lifecycle rule was validated (`terraform validate`), not planned or applied.
