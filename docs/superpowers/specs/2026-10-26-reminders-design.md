# Reminders (5.1, 6.13, spec §6.18)

Status: built (2026-10-26). Every detail below is my call.

## Why

The Learning Director plans the week, but nothing reminded the learner of it: a plan on a
screen they do not open does nothing. Spec §6.18 asks for practice reminders worded by the
partner, a cards-due reminder, quiet hours, a frequency limit and a way to switch them off.

## On the device, not pushed

- **Scheduled on the phone** with `expo-notifications`: no push server, no device tokens, no
  new AWS resource, no store setup. The plan the phone needs is already on Today.
- Each time Today opens (and after any change on 6.13), the **next seven days** are worked out
  again from this week's plan and scheduled, replacing what was there
  (`src/reminders/schedule.ts`, plain code, tested). A learner who stops opening the app stops
  being reminded after a week: no nagging someone who has gone.
- The server adds one thing to Today's plan: `upcoming`, the planned days among the next seven,
  into next week (`domain/director.py`), so the phone does not repeat the Director's rules.
- A tapped reminder opens Today. Signing out (or deleting the account) takes every reminder back.
- While the app is open, a reminder due then is not shown: the learner is already here.
- Android may deliver a reminder a few minutes late: Konvami does not ask for exact alarms, which
  Google Play restricts and a reminder does not need.

## What and when

- **At most one a day**, at the **learner's time** (18:00 unless they choose another), **never at
  night**: the times offered run from 07:00 to 21:00. These are the quiet hours.
- **A planned day:** "Lena · Got a few minutes? Your plan for today is ready." Today's own:
  "Got 15 min? Today's plan is ready."
- **A simulation still to do this week** (spec §6.13) is named on the week's next planned day:
  "Your Goethe-Zertifikat B1 simulation is planned for this week."
- **Cards:** once, on the first day without practice planned, while cards are due, and only if
  the learner wants it ("Your cards are waiting, back before you forget them").
- **Nothing more today** once the learner practised or today's plan is done; the rest of a week
  that is done, or out of voice minutes, waits for next week.
- **Worded by the partner** Today suggests (their name is the title), in the app's language, and
  never a reproach (spec §16: no guilt-tripping): no "you missed", no streak warnings.

## Asking

- **Offered once, when first useful** (spec §6.1.2): after the first conversation, a card on
  Today: "A reminder on your practice days? Lena can send you a short note at 18:00…" with "Remind
  me" and "Not now". The system's permission prompt appears only after "Remind me". Either answer
  is kept and the card does not come back.
- **6.13 Reminders** (Profile → Reminders): on or off, the time, and the cards reminder, with when
  the next one comes. Turned on, it asks the phone if it has not yet. Where the phone does not
  allow notifications, it says so and opens the phone's settings. In the web preview it says that
  reminders come in the phone app.

## Stored on the device

- The choice is a **device preference** (`konvami.pref.reminders`), not a profile field (spec
  §6.1.2 puts reminders in the profile): the permission is per phone and the schedule lives on it.
  A second phone asks again.

## Left out, and why

- **Follow-ups on real-life events** ("Your appointment was today: tell me how it went"): the
  memories name events in words for the partner ("Has a job interview"), not as text that reads
  well in a notification; a follow-up worded by the partner needs a text model, which a schedule
  made on the phone has not got.
- **"Word of the day"** voice clips: optional in the spec, and they need sound made per day.
- **Pen-pal notes** (spec §6.16) and any push from the server: no push set-up yet.

## Native module

`expo-notifications` 57.0.22 (pinned: 57.0.24, which `expo install` picked, was four days old).
It is a native module: the development build on the iPhone and the Android preview build must be
rebuilt before reminders work there. The Android notification icon is the white mark
(`pnpm brand:export` writes `assets/brand/notification-icon.png`).

## Checked

- `services/api`: the planned days ahead, over HTTP; ruff, mypy.
- `apps/mobile`: the schedule (unit tests), the preference, Today's offer, 6.13 in each state, a
  tapped reminder and signing out (Testing Library), tsc, ESLint; visual checks with
  `.playwright-mcp/check/setup24.js` + `all24.js` (a stand-in for the phone's notifications) at
  the five sizes in light and dark, and German and French at three sizes.
- **Not yet on a phone:** a reminder arriving, its icon and a tap opening Today need a rebuilt
  development build.
