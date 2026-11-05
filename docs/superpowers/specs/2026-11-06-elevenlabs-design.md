# Premium voices (ElevenLabs): reading aloud in a voice the learner picks

Spec §6.21.2 (Pro: "premium voices (ElevenLabs)"), §9.2 (the cascaded option), §15 (provider
portability), §6.19 (consent). Screen 6.22 Read-aloud voice (not drawn on the canvas), and the
ElevenLabs switch on 2.5 and 6.7.

## What it is

A learner can pick one ElevenLabs voice. It then reads aloud what the app speaks **outside a live
call**: a word card's sound (5.7, 5.11), the weekly check-in's "Listen" (5.8), an exam's model
answers (5.18) and the sample on 6.21. Everything else is unchanged: the standard OpenAI voice is
always one of the choices and is what every learner hears until they choose.

## What it is not: live conversations

Live calls stay on OpenAI's realtime voices (spec §9.1). The cascaded path of §9.2 (speech to text,
a model, text to speech) was not built, for these reasons:

- It adds two round trips to every turn (the spec's own latency argument for §9.1), and a premium
  voice that makes the partner answer slowly is worse than the standard voice.
- The call worker, the recordings (§9.4, which fetch the learner's audio from the realtime
  session), the live error spotter and the partner's tools are built around one realtime session.
  A cascade replaces all of them, which is a project of its own.
- A premium voice would also mean a partner (6.6) whose voice differs between its calls and its
  cards, so Persona Studio's voices and samples stay OpenAI's.

If it is built later it needs the `SpeechModel` seam below, a streaming variant of it, and a
second call script. Nothing here stands in its way.

## Three conditions before ElevenLabs hears a word

1. **Configured.** `KONVAMI_PREMIUM_VOICES` names a model and at least one voice, and
   `KONVAMI_ELEVENLABS_SECRET_ARN` names the key's secret. Otherwise `PremiumVoices.offered` is
   false: nothing is offered, the consent screens do not name ElevenLabs, the Profile has no row.
2. **The learner agreed** (`Account.premium_voice_consent`): a consent record of version 3 or later
   with `elevenlabs=1`. The server reads it from the account (Cognito `custom:ai_consent`) at every
   request, so withdrawing it takes effect at once.
3. **The learner may use premium voices** (`PremiumVoiceAccess.can_use_premium_voices`).

Otherwise the text is spoken by the standard voice. A learner who has not agreed is never sent to
ElevenLabs. Only the **text to speak** is sent, never a learner's audio, and the text is a card's
word and sentence, a check-in or a model answer.

## Consent v3 (2.5, 6.7)

The consent text is `v3`. It names ElevenLabs as **optional, off by default**, with what it is for
("reads words and phrases aloud in a premium voice you choose") and what it receives ("the text to
read aloud, never your voice"). The record is still
`v3|<ISO time>|openai=1,elevenlabs=0|1,bedrock=0`.

- On **2.5** the switch is shown only where the server offers ElevenLabs (the app reads
  `GET /v1/premium-voices`). Agreeing without turning it on stores it as not agreed.
- On **6.7** it is a switch that writes the account at once and then reads the server's view
  again.
- The server counts ElevenLabs consent only on a record of `v3` or later. A `v1` or `v2` record
  that happens to carry `elevenlabs=1` (the canvas had the switch before ElevenLabs was in use)
  counts for nothing: those texts did not describe this use.
- **Existing learners are told, not blocked.** Someone who agreed under `v1`/`v2` keeps their
  OpenAI agreement; locking them out for an optional provider would be wrong. 6.7 shows a "New:
  ElevenLabs can read…" note and the Profile has the Read-aloud voice row, which opens on the
  question. Until they answer, ElevenLabs hears nothing from them. There is no push or blocking
  prompt: a learner who never opens 6.7 or the row is never asked, and never sent to ElevenLabs.

## Pro gating: the seam

Subscriptions are built elsewhere. `domain/premium_voices.py` defines `PremiumVoiceAccess` with one
method, `can_use_premium_voices(user_id)`. `PilotAccess` is the stand-in: the cost owners always,
and everyone while `premium_voices.open_to_testers` is true (the default, as the voice minutes are
60 a week for every tester). When the subscription service exists it implements the protocol
(Pro), `main.py` passes it in place of `PilotAccess`, and nothing else changes. The app already
shows "Premium voices aren't part of your plan" when the server says `allowed: false`.

## Design

- **Provider** `providers/elevenlabs_speech.py`: `ElevenLabsSpeech` implements the existing
  `SpeechModel` protocol (`httpx`, no new dependency). `SpeechTask.model` is ElevenLabs' model id
  and `.voice` the voice id (checked as letters and digits, because it goes into the address). The
  key is read per request through the same cached secret reader as OpenAI's, and is never part of
  an error. Output is MP3, so stored sounds keep one file type.
- **Domain** `domain/premium_voices.py`: `PremiumVoices` (the configured model and voices),
  `PremiumVoiceService` (status, choose, sample, `choice_for`), `PremiumVoiceAccess`/`PilotAccess`,
  `ChoiceRepository`.
- **Sounds** (`domain/sounds.py`) asks the service for the learner's choice (the charge carries the
  learner). With a choice it speaks with ElevenLabs under a key that includes the provider, model,
  voice and text, so a new voice or text is spoken anew and an old sound is never played for it. If
  ElevenLabs fails, the standard voice reads: premium is a bonus, never a broken card.
- **Samples** on 6.22 are spoken once per voice and language and kept
  (`voices/premium/<lang>/<voice>-<fingerprint>.mp3`), like the partners' samples.
- **Storage:** migration `0055_premium_voice_choice.sql`, one row per learner who chose a voice
  (none: the standard voice), removed with the account.
- **API:** `GET /v1/premium-voices`, `PUT /v1/premium-voices/choice` (`voiceId` or null),
  `GET /v1/premium-voices/{id}/sample`. Errors: `consent_needed` and `not_allowed` (403),
  `not_offered` and `no_language` (409), `unknown_voice` (422), `voice_unavailable` (503).
- **Cost** (`domain/costs.py`): ElevenLabs bills by characters, which the answer does not report,
  so the text's length is metered under provider `elevenlabs` and the model's name, against the
  learner (`CARD_AUDIO`, `WEEK_AUDIO`, `EXAM_AUDIO`, `VOICE_SAMPLE`). The price is
  `prices["eleven_multilingual_v2"] = {characters: …}` in `infra/envs/dev/variables.tf`. The
  default, 300 per million characters, is the upper end of ElevenLabs' plan rates and an
  estimate: set the rate of the plan actually bought, because the owner's budget (6.12) counts
  this figure. Spoken sounds are kept, so each text is paid for once per voice.
- **Infra:** `elevenlabs_enabled` (default false) creates the secret `kv-dev-elevenlabs-api-key`
  from the ephemeral variable `elevenlabs_api_key`, written with a write-only attribute like
  OpenAI's, so the key is in neither the state nor a plan. `premium_voices` (model, voices with
  their ids and names, `open_to_testers`) is passed to the Lambdas as a setting. The API's role may
  read the secret only when it exists. `terraform validate` passes; nothing was planned or applied.

## To turn it on

1. In ElevenLabs, create an API key and pick voices that speak the target languages well (German
   first); copy their ids from the voice library.
2. In `infra/envs/dev/terraform.tfvars` (gitignored): `elevenlabs_enabled = true`,
   `elevenlabs_api_key = "…"`, `premium_voices = { voices = [{ id = "…", name = "…" }] }`, and the
   real rate in `prices` if it differs.
3. Build the API package from `main`, `terraform plan -out=tfplan`, read it, then apply.
4. In the app: Profile › Read-aloud voice (or Privacy and AI) › turn ElevenLabs on, pick a voice.

## What is not built

- Live calls with a premium voice (the cascade above).
- A blocking or pushed re-consent for learners on `v1`/`v2`.
- Pro gating (the seam is ready; the subscription is not).
- Voice descriptions: voices are listed by their provider's own names with a sample, like 6.6.
- Per-language voices: one voice reads every language (the multilingual model); a voice that
  suits German may sound wrong in French. The learner hears the sample in their target language
  before choosing.
- A real call to ElevenLabs: the provider is tested against a mock transport only, and the key was
  not available. The first real sample (6.22) is the first real request.
