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

## Follow-ups on real-life events (added the same day)

- When the memory writer reads a conversation (the small text model, after the report), it also
  writes, for an **event still to come**, the one question its partner sends the day after it, in
  the learner's explanation language and familiar form: "Alors, comment s'est passé ton entretien
  à la banque à Genève ?". No extra request: it is one more field of the same answer. It is kept
  with the memory (`memory.ask`, migration 0024); changing the memory's words drops it (it was
  asked about the old words), moving its day keeps it.
- Today carries the questions of the next seven days (`reminders.followUps`); none while memory
  is off, as partners are then told nothing from before.
- On its day, the question **takes that day's one reminder**, from the partner Today suggests. A
  switch on 6.13 ("Ask how things went", on by default) turns them off.
- **Tried with the real model** (2026-10-26, gpt-6-luna; French and English): the right day for
  "am Dienstag", "morgen", "am Sonntag", no question for yesterday's dentist, and questions that
  read well on their own ("So, how did your first day as a nurse go?").

## A word of the day (added the same day)

- **Off by default** (the spec makes it optional); a switch on 6.13 turns it on.
- Each of the next seven days has one of the learner's saved words (`reminders.words`): they take
  turns among the newest hundred cards' words, so a day keeps its word and two days in a row never
  share one. No sound is made for it ahead: a notification cannot play a clip.
- The word **joins the day's reminder** on a line of its own ("Today's word: die Abschiedsfeier
  (the farewell party)"), or on a day with nothing else **comes alone** ("Today's word ·
  die Abschiedsfeier: the farewell party. Tap to hear it."). Tapped, it opens its card on Learn
  (`GET /v1/cards/{id}`), with Listen in the partner's voice.

## Left out, and why

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
