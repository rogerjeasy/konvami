# Your partner calls you, and home-screen widgets (5.28)

Gaps 5 and 7 of `docs/research/2026-11-20-competitor-gap-analysis.md`. Duolingo's "Lily calls
you" and Speak's tutor calls show that a voice that reaches out brings learners back; Konvami
already has the parts (partners with memories, reminders on the device, quiet hours, voice
minutes). Decisions marked **my call** were made without asking, per the owner's instruction.

## Partner calls

### What the learner sees

1. **Off by default.** 6.13 Reminders has a switch "My partner calls me", with what it does
   under it. Today offers it once (`today.calls`), after the third conversation, where reminders
   are on and the phone allows notifications; either answer is final (**my call**: offering it
   with the first reminder would be two asks at once, and three conversations show the learner
   comes back).
2. **At the reminder time on a planned day**, instead of that day's reminder, a notification
   from the partner Today suggests: "Lena is calling", "Got 3 minutes to talk? Tap to answer."
   On the day after an event the partner rings with its question: "How did the interview go?
   Tap to answer: about 3 minutes."
3. **Tapping it opens 5.28**, the forest call block (every call is forest with lime): the
   partner's portrait in two rings that swell like a ring, "Lena is calling", "A short call,
   about 3 minutes", the question when there is one, and three actions:
   - **Answer** starts a practice call (5.3) with that partner, at most five minutes.
   - **Not now** goes to Today. Nothing is held against the learner.
   - **Remind me in an hour** rings once more in an hour and says at what time.

### Rules

- **One proactive contact a day.** A ring replaces the day's reminder, at the same time, so the
  device never sends both. Pen-pal notes keep their own schedule on the server (one to seven a
  week, quiet hours, chosen by the learner on 5.21); the device cannot know when one will come, so
  the cap holds across reminders and rings on the device, and the pen-pal frequency stays the
  learner's choice (**my call**).
- **Never at night.** Rings come only at the reminder times the learner can choose (07:00 to
  21:00).
- **Never without voice minutes.** A week out of minutes, or done, schedules no ring, as for
  reminders; the server refuses a call when the cost kill switch has paused voice, and the
  call screen says so as for any call.
- **A simulation's day keeps its reminder.** A simulation is a whole ten-minute call; a
  three-minute chat would crowd it out.
- **Words and cards.** A ring carries no word of the day: the call is the day's one thing. A day
  without practice still reminds of waiting cards.

### Not a phone call

The ring is a notification and an app screen, never a phone call at the operating-system level:
no CallKit on iOS, no full-screen call intent or ringtone on Android, no "missed call" (**my
call**). Pretending to be a call would be the "fake urgency" the research warns against, App
Review rejects VoIP pushes for anything but real calls, and the learner's phone settings stay in
charge:

- **iOS:** the notification is `timeSensitive` (entitlement
  `com.apple.developer.usernotifications.time-sensitive`, store builds only). iOS shows it at once
  and lets it through a Focus only where the learner allows Konvami in that Focus. Do Not Disturb
  still silences it.
- **Android:** rings use their own channel, "Partner calls" (high importance, so it pops up), with
  `bypassDnd: false`. The learner can quiet rings in the system settings without quieting
  reminders.

### The call

The app starts the call with `rang: true` (`POST /v1/voice/calls`). The server:

- accepts it only for a free practice conversation with one partner (no role-play, topic,
  lesson, import or second partner), else `voice_unavailable`;
- caps it at `RANG_CALL_SECONDS` (300; **my call**: "about 3 minutes" said, a little room to say
  goodbye), still within the week's minutes;
- tells the partner it called: it opens as the one who rang, about what is most current in what
  it knows of the learner (an event that just happened or is coming up), otherwise the
  conversation's focus, which the Session Planner fills from the reports (and from the Coach once
  merged);
- keeps `rang` on the session (migration 0250) so accepted rings can be counted; the data export
  includes it with the session.

Reports, memories, recordings and metering are those of any practice call.

## Widgets

### What the widget shows

The streak, the next planned practice ("Lena calls at 18:00" when rings are on, "Practice at
18:00" otherwise) and **Talk now**, which opens `konvami://call/<partner>`, a call with the
partner Today suggests (`konvami://today` without one). Today writes it as a **timeline**
(`src/widgets/snapshot.ts`): an entry now and one at each planned time, each naming the next one
still ahead, so the widget moves on without the app being opened. Whether the learner practised
is only known when the app opens, so later entries do not claim it.

### Why it is off by default (my call)

`expo-widgets` (SDK 57: iOS widget extension with SwiftUI through `@expo/ui`, Android app
widgets behind `enableAndroid`) is a native target: a new extension in the iOS project, an App
Group, signing for the extension, and a new native module (`@expo/ui`) in every build. None of
it can be checked without a device build, and a broken extension fails store builds. So:

- the data layer (`src/widgets/snapshot.ts`, `use-widget.ts`) is built and tested, and Today
  writes the timeline;
- `src/widgets/bridge.ts` hands it to nothing;
- `plugins/with-konvami-widgets.js` adds the native target only with `KONVAMI_WIDGETS=1`, and stops
  with a clear message when `expo-widgets` is not installed. Without the variable it changes
  nothing, so `expo prebuild` and the web build are as before.

### To turn the widget on (owner, with a device)

1. In `apps/mobile`: `npx expo install expo-widgets` (it brings `@expo/ui`). Check the lockfile
   resolved versions at least two weeks old (AGENTS.md §1.7).
2. Replace the body of `src/widgets/bridge.ts` with the `Widget` of `expo-widgets`, as its comment
   shows, and write `KonvamiTodayLayout`: the streak (flame, number), the next practice line, and a
   "Talk now" link to `props.url`, in the v4 look (ink tile, lime accent). Check the component
   names against the `expo-widgets` documentation for SDK 57.
3. Build with `KONVAMI_WIDGETS=1` (a local `.env` for `pnpm device:ios`, or the EAS environment):
   the plugin adds the widget `KonvamiToday` and the App Group `group.app.konvami`.
4. In the Apple Developer account: the App Group and the widget extension's App ID (EAS can
   create them on the next build with `eas credentials`).
5. Try it on an iPhone and an Android phone: add the widget, open Today once, check the next time
   moves on after it passes, and that Talk now opens a call.

## Not done

- No ring from the server by push: rings are scheduled on the device, like reminders, so a
  learner who stops opening the app stops being rung after a week. Push could ring later, once
  the push credentials exist (release checklist C9, C10).
- No notification actions ("Answer" on the notification itself): the screen is one tap away.
- No Live Activity during a call.
- Rings were checked in tests and in the web preview only; the notification itself (time-sensitive
  level, Android channel) needs a device build.
