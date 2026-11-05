# Crash reports, usage counts, feedback and support (6.20, 6.21, 6.7; spec §6.21.4)

Status: built (2026-11-06). Built without a round of questions; every choice below is mine.

## Why

Spec §6.21.4 lists what a public app also needs: crash and performance monitoring (Sentry),
privacy-friendly analytics (PostHog, EU, only with consent), an in-app feedback form, an FAQ and a
support address. The app teaches with a learner's own words, so each of these must be built so
that nothing a learner said or wrote can leave the device by accident.

## What

- **Crash reports (Sentry)** in the app and in the API and call worker. Off unless a DSN is
  configured: `EXPO_PUBLIC_SENTRY_DSN` for the app, Terraform variable `sentry_dsn` for the
  backend (which sets `KONVAMI_SENTRY_DSN`; empty changes no function setting). A DSN only lets a
  client send events in, so it is a setting, not a Secrets Manager secret.
- **Anonymous usage counts (PostHog, EU cloud)**, only in a build with `EXPO_PUBLIC_POSTHOG_KEY`
  and only for a learner who turned on 6.7 "Share anonymous usage data" (off by default).
- **Feedback** (6.20 Help and feedback): a category (a problem, an idea, something else), a
  message (2,000 characters) and "Include device and app version" (off by default). Stored in the
  database; the owner reads it on 6.21 Feedback, opens it, marks it done.
- **Support**: eight FAQ questions in four languages, and an email row shown only when
  `EXPO_PUBLIC_SUPPORT_EMAIL` is set.

## What is sent, and what is never sent

**Crash reports** carry the error's type, its stack (function names, no local variables), and the
device, operating system and app version. Every piece of free text is replaced by `[redacted]`: an
exception message can quote a sentence the learner said or a name they typed, and no pattern can
tell. Only a snake_case code (`not_found`) or one of a few fixed one-word codes (`network`) is kept.
Dropped: requests (bodies, headers, cookies, query), breadcrumbs, tags, extras, `logentry`,
mechanism data, every context except device, os, app and runtime, and the server name. Off:
screenshots, view hierarchies, sessions, performance traces, default PII, app hangs, failed
network requests. The API names a learner by a one-way hash of their id (`observability.identify`);
the app names nobody.

Limit: the scrubber runs in JavaScript (`beforeSend`) and in Python. A crash in native code is
captured and sent by the native SDK at the next launch without it; the native options keep scope
text out, but a native crash's own reason string is not scrubbed by our code.

**Usage counts** are three events (`app_opened`, `conversation_started` with the call purpose,
`feedback_sent` with the category), each with the app version and platform, a random install id,
and no person profile. The id is made after the learner agrees, is not tied to the account, and is
deleted the moment they turn the switch off (a later "yes" makes a new, unrelated id; an id being
made while they withdraw is not saved). PostHog is called with `fetch`, so there is no SDK, no
advertising identifier and no App Tracking Transparency prompt. A host that is not https is
refused.

**Feedback** carries the category, the message and, if ticked, the app version, the platform (iOS,
Android, web) and the system version. Not conversations, recordings, reports or the learner's
name. The form says so.

## How

- Backend: `domain/feedback.py` (`FeedbackService`: empty or too long messages refused with
  `invalid_value`, 10 messages a day then `feedback_limit`, owner-only inbox), migration
  `0045_feedback`, `SqlFeedbackRepository`; `POST /v1/feedback`, `GET /v1/owner/feedback?status=`,
  `PUT /v1/owner/feedback/{id}`; `observability.py` (Sentry, `scrub`, `user_hash`), called when
  the Lambda container starts (`main.py`) and by `current_user`.
- Terraform: `sentry_dsn` in `modules/api` and `envs/dev` (default empty); the function
  environments merge it in only when set.
- App: `src/monitoring` (lazy Sentry, `scrubEvent`; screens that break report through the error
  boundary), `src/analytics` (`track`, PostHog sender, install id), the `analytics` device
  preference, `screens/help`, `screens/feedback-inbox`, the Help row and the owner's Feedback row
  on the Profile. The Expo plugin `@sentry/react-native/expo` is added only when the DSN is set at
  build time.
- Supply chain: `sentry-sdk` 2.72.0 (October 2026) and `@sentry/react-native` 7.11.0 (Expo's
  compatible version). `@sentry/cli`'s install script, which downloads a source-map upload binary,
  is blocked (`allowBuilds`), and `SENTRY_DISABLE_AUTO_UPLOAD` is set in `eas.json`.

## To switch on

1. Create a Sentry project for the app and one for the backend. Put the app's DSN in
   `apps/mobile/.env` (and as an EAS environment variable) and the backend's in `terraform.tfvars`
   (`sentry_dsn`); plan, then apply.
2. Create a PostHog project in the EU cloud; put its public key in `EXPO_PUBLIC_POSTHOG_KEY`.
3. Set `EXPO_PUBLIC_SUPPORT_EMAIL` once a support address exists.
4. Source maps (readable app stack traces): allow `@sentry/cli` in `pnpm-workspace.yaml`, give EAS
   a `SENTRY_AUTH_TOKEN` and the organisation and project, and remove `SENTRY_DISABLE_AUTO_UPLOAD`.
   Not done yet: it needs the Sentry account.
5. Name Sentry and PostHog in the privacy policy before turning them on in a store build
   (decision for the privacy policy, spec §6.21.3).

## Differences from the spec, and why

- **No performance monitoring.** The spec says "crash and performance monitoring"; traces would
  add a data flow and a cost before there is anyone to look at them.
- **No replies.** A message carries no name or email, so the owner cannot answer it from the app;
  the support address is for that.
- **Three analytics events.** Enough to see whether the app is opened and used; more can be added
  to the list in `analytics/posthog.ts`, which is also what the privacy notice must say.
