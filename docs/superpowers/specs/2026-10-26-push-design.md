# Push from the server (spec §6.18)

Status: built (2026-10-26), on top of the reminders. Every detail below is my call; the
credentials at the end are the owner's to set up.

## Why

Reminders are scheduled on the phone, so they only know what the phone knew when the app was
last opened. Three things happen while the app is closed: a report is written after the call, a
simulation is scored, and a learner simply stops coming (the phone's own reminders stop after a
week, on purpose). For those, the server sends a push.

## What is sent

- **"Your report on our conversation is ready"**, from the partner, when the worker has written
  a report; a tap opens it (5.10).
- **"Your simulation is scored. See how you did."**, titled with the test ("Goethe-Zertifikat B1"),
  when the scorer is done; a tap opens the score (5.18).
- **One nudge after a quiet week**: "It's been a while. Got five minutes to talk?", from the
  partner the learner talked to last, at **their own reminder hour**, at most **once a week**, and
  only when they have not talked for seven days (or, never having talked, since the phone was
  registered). A tap opens Today.
- Each push is in the **app language** the phone registered with (English, German, French,
  Italian), written on the server (`domain/push.py`), never a reproach.

## Who may be reached

- The app **registers the phone** (`PUT /v1/push/device`: its Expo push address, platform, time
  zone, app language and reminder time) only while the learner is signed in, has reminders on and
  the phone allows notifications. Turning reminders off removes it (`DELETE
  /v1/push/devices/{token}`), and so does **signing out**: the session runs the removal first,
  while the account can still be reached (`SessionStore.beforeSignOut`, a few seconds at most). A
  phone registered by another account moves to it. Deleting the account deletes its phones.
- So the same switch on 6.13 governs reminders and push; 6.13 says so in one line.
- A token the provider no longer reaches (the app was removed) is forgotten at the next push.

## How

- **Expo's push service** (`providers/expo_push.py`), which hands each message on to Apple and
  Google with the credentials EAS keeps. The server holds no key: a token only reaches the app it
  was made for. Batches of 100; a failure is logged and never breaks what triggered it.
- The report writer and the scorer **announce** a result through an optional callable (as the
  Session Planner reads the week's topic), so their modules do not know about push.
- **The nudge runs once an hour**: an EventBridge rule (`kv-dev-nudges`, `cron(0 * * * ? *)`)
  starts the call worker with `{"nudges": true}`. It looks at each phone whose local hour is its
  reminder hour.
- Storage: `push_device` (migration 0025).

## What only the owner can set up

1. **Android**: the Firebase project's **service-account key** goes to EAS (Expo sends with it):
   `npx eas-cli credentials -p android` → the app's build profile → Google Service Account →
   "Push Notifications (FCM V1)" → upload the key file. The key is never committed (`.gitignore`
   and `pnpm check:secrets` refuse `*firebase-adminsdk*.json`).
2. **Android**: the Firebase **app config** (`google-services.json`, Firebase console → Project
   settings → add an Android app with the package `app.konvami`, and `app.konvami.dev` for the
   development build). It goes to EAS as a file variable `GOOGLE_SERVICES_JSON`; `app.config.ts`
   uses it when it is set. Without it the app has no push address and simply registers nothing.
3. **iOS**: an **APNs key**, which EAS can create with the Apple Developer account
   (`npx eas-cli credentials -p ios` → Push Notifications). Without it iPhones get the phone's own
   reminders only.
4. Then rebuild the development and preview builds.

## Left out, and why

- **Push receipts** (Expo's second step, which reports delivery failures minutes later): the
  first answer already says when a phone is gone, which is what matters for a tester group.
- **Pen-pal notes** (spec §6.16): not built.
- **"Your weekly check-in is ready"**: it is written when Progress opens, so the learner is
  already there.

## Checked

- `services/api`: the messages and who gets them, a provider that fails, a phone that is gone,
  phones moving between accounts, the nudge's hour and week, reports and scores announcing
  themselves (on a whole backend), both stores, the provider against a stand-in HTTP service, the
  routes, the worker's schedule job; ruff, mypy. `terraform validate`.
- `apps/mobile`: registering and removing the phone, before sign-out, tap targets (Testing
  Library), the session's tasks before sign-out; tsc, ESLint; 6.13 checked visually at the five
  sizes, in light and dark, and in German and French.
- **Not yet on a phone**: no push has reached a real device; that needs the credentials above.
