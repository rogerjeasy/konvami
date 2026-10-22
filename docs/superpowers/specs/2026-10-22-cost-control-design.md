# Cost control (6.1, 6.12, spec §6.19, §17, decision D5)

Status: built (2026-10-22); not yet deployed. The owner chose 60 voice minutes a week, the
cheaper voice model plus an email past the target, and a costs page in the app.

## Why

The budget is $150 a month with a $250 ceiling (D5). The AWS budget covers AWS only and alerts
after the fact; most of the money goes to OpenAI, and nothing turned its usage into dollars or
minutes. A few heavy testers could pass the ceiling unnoticed. It is the last P0 piece before
inviting testers.

## What

- **Metering.** Every paid request is recorded (`usage_charge`) with the learner, the feature
  and an estimated cost: voice calls (setup, placement test, conversations), the placement
  assessment, writing partners, the report and its second check, memory, the Tutor, the second
  transcription and voice samples.
- **Prices are a Terraform setting** (`prices` in `infra/envs/dev`), US dollars per million
  units: tokens for the realtime and text models, characters for speech, seconds of audio for
  transcription. Defaults from OpenAI's pricing page on 2026-10-22. A model without a price is
  recorded as unpriced and shown as such.
- **A weekly voice allowance** of 60 minutes per learner, for calls of every purpose, replacing
  the 10 calls a day. A call starts with no more time than is left (at least one minute);
  the server ends it there. Weeks begin on Monday at midnight UTC.
- **The spending guard.** The month's estimated spend decides the level: past $150 new calls
  use the cheaper voice model (`voice.economy_models`: setup and placement test move to the
  mini model; conversations already use it), at $250 new voice calls stop (`voice_paused`).
  Text features keep working. Each step is emailed once a month through an SNS topic.
- **The app.** Calls refused for minutes say so kindly and when they come back; a paused call
  says that cards, reports and the Tutor still work. Profile shows the minutes left this week.
  The owner's account sees a Costs row leading to **6.12 Costs**: the month's total against
  target and ceiling with its level, spend per day (tap a day for its amount), per feature,
  per provider, and the ten learners who cost the most; earlier months can be opened.

## How

- Text, speech and transcription tasks carry a `Charge` (learner, feature); the OpenAI
  providers report what each answer used to the `Meter`, also for an answer that cannot be read
  (it was paid for). A voice call is metered when it ends, from the tokens counted during it
  (cached tokens split into text and audio, as they are priced apart). Metering never fails
  the request.
- Voice seconds are granted in one statement on a per-learner, per-week row (`voice_week`), so
  calls started together cannot be granted the same minutes. A call that cannot start gives its
  time back; an ended call gives back what it did not use. A call is concluded once, so its
  time is never given back twice.
- The guard sums `usage_charge` for the month at each call start and after each metered request,
  and records each step emailed in `spend_alert`; an email that cannot be sent is tried again.
- A deleted learner's charges stay, without the learner, so the month's spend still counts them.
- The owner is a user pool subject in the `cost_owners` Terraform variable. `/v1/owner/costs`
  answers 403 `not_owner` to anyone else; `/v1/account` says whether the caller is the owner.

## Not in this step

Subscriptions and the free tier (RevenueCat, store accounts), the providers' real invoices
(the numbers are estimates), AWS costs in the estimate (the AWS budget covers them), alerts at
50% and 80%, and the separate Next.js owner console of spec §6.19.
