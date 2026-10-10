# Konvami design

**Source of truth:** the claude.ai Design canvas
https://claude.ai/artifact/LHpzPuTBCcjS5WBXvZsVyG (private). Each artboard shows a phone screen in
light and dark side by side. Build screens exactly as drawn; tokens are in
`packages/design-tokens/src/tokens.ts` (do not copy hex values from the canvas into app code).

**Local copy:** `canvas-2026-10-06/` holds the canvas files as they were on 6 October 2026 (one
`.dc.html` per artboard). Use it when the canvas link cannot be opened; anything changed on the
canvas after that date is not in it.

| Section | Screens | Status |
| --- | --- | --- |
| 1 · Brand & first launch | 1.1 Splash · 1.2 Intro: Speak · 1.3 Intro: Corrections · 1.4 Intro: Progress · 1.5 Welcome | Built (`apps/mobile/src/screens/{launch,intro,welcome}`) |
| 2 · Create account | 2.1 Age check · 2.2 Create account · 2.3 Email sign-up · 2.4 Verify email · 2.5 AI data consent · 2.6 Microphone · 2.7 All set | Built (`apps/mobile/src/screens/create-account`). Email sign-up is real (Cognito); Apple and Google are placeholders until their credentials exist. Design note: `docs/superpowers/specs/2026-10-09-create-account-design.md` |
| 3 · Sign in & recovery | 3.1 Sign in · 3.2 Error · 3.3 Face ID · 3.4 Link sent · 3.5 Forgot password · 3.6 Reset sent · 3.7 New password · 3.8 Updated | Built (`apps/mobile/src/screens/sign-in`), except 3.4: the emailed sign-in link needs Amazon SES and is a "coming soon" notice for now |
| 4 · Onboarding | 4.1 Talk with Mia · 4.2 Form (five steps) · 4.3 Review · 4.4 Placement intro · 4.5 Placement test · 4.6 Placement result · 4.7 Starter partners (and editing one) · 4.8 Ready | Built (`apps/mobile/src/screens/onboarding`, backend in `services/api`). **Not drawn on the canvas**: built directly in the visual language below and reviewed in the running app (decided 2026-10-09). Design note: `docs/superpowers/specs/2026-10-09-onboarding-design.md` |
| 5 · Home | 5.1 Today · 5.2 Talk · 5.3 Conversation · 5.4 Conversation done · 5.5 Library · 5.6 Transcript · 5.7 Learn · 5.8 Progress | Built (`apps/mobile/src/screens/{tabs,today,talk,conversation,library,learn,progress}`, backend in `services/api`). **Not drawn on the canvas**, like section 4. Learn and Progress say what will be there; their features are not built. Design note: `docs/superpowers/specs/2026-10-10-home-design.md` |
| 6 · Profile | 6.1 Profile · 6.2 Personal · 6.3 Learning · 6.4 My partners · 6.5 New partner · 6.6 Persona Studio · 6.7 Privacy and AI · 6.8 Security (change password, change email) · 6.9 Delete account | Built (`apps/mobile/src/screens/{profile,partners}`, `apps/mobile/src/profile`, backend in `services/api`, bucket in `infra/modules/media`). It replaces 5.9 Account. **Not drawn on the canvas**, like sections 4 and 5. Design note: `docs/superpowers/specs/2026-10-10-profile-design.md` |

## Where the app differs from the canvas, and why

| Screen | Difference | Reason |
| --- | --- | --- |
| 2.2, 3.1 | Apple and Google show a "coming soon" notice | They need the Apple Developer and Google OAuth credentials |
| 2.3 | A "Confirm password" field is added | Requested on 2026-10-09 |
| 3.1 | "Email me a sign-in link instead" shows a "coming soon" notice; 3.4 is not built | Cognito can only send sign-in emails through Amazon SES (own sender, production access), which is not set up yet |
| 3.2 | "n tries left before a 5-minute pause" is counted on the device | The service does not say how many tries are left; it keeps its own lockout as well |
| 3.3 | No streak chip and no "persona is waiting" card | That data does not exist yet, and a made-up streak would mislead a real user |
| 3.5–3.7 | A 6-digit reset **code** instead of a reset link; 3.6 has the code field, 3.7 has no "Secure link verified" chip | Cognito resets passwords with a code. The code is checked together with the new password |
| 3.5 | No "Signed up with Apple or Google?" note | Nobody can sign up that way yet |
| 3.7 | No "Not used before" chip | Only the service can know; it refuses a reused password and the screen says so |
| 3.8 | No "We sent a confirmation… Contact support" note | No such email is sent yet and there is no support address |
| 3.8, 2.6 | "this device" instead of "this iPhone" | The same text is used on Android |
| 1.2–1.4, 2.7 | Persona portraits are drawn avatars, not initials on a colored disc | The avatar component of section 4 replaced the placeholder everywhere |
| 4 (all) | Avatars are illustrated in code from a few parts and colors | The painterly, realistic style of decision D17 needs a character artist; the stored look is renderer-neutral so the drawing can be replaced |
| 4.1, 4.5 | Voice works in development and store builds and in the web preview, not in Expo Go | WebRTC is a native module; in Expo Go the screen explains this and offers the form (4.1) or skipping the test (4.5) |
| 4.7 | During onboarding only a partner's name and look can be changed | The rest is changed in Persona Studio (6.6), which opens once the learner is in the app |
| 4.8 | No trial offer on the ready screen | The 7-day trial needs RevenueCat and the store accounts |
| 5 (all) | The tab bar is drawn by the app, not by the system | It uses the design tokens, is the same in the web preview, and becomes a side rail on wide windows |
| 5.1 | No daily plan, due cards or pen-pal notes on Today (spec §14.1) | Those features are not built; Today shows what exists: the partner, the week, the level, what to polish, the exam, recent conversations |
| 5.3 | A conversation lasts at most 10 minutes and has no help buttons or correction chips | The call worker runs on Lambda (15-minute limit); help buttons and live corrections belong to the full live session (spec §6.4, §6.5) |
| 5.5, 5.6 | The library holds text only | Recordings need the audio pipeline (S3, spec §6.6) |
| 6.1 | No memories, subscription or usage on the Profile (spec §14.1) | Those features are not built; the Profile shows what exists |
| 6.2 | The photo is chosen from the library; it cannot be taken with the camera | The app is configured never to open the camera (`app.config.ts`: the Android permission is blocked) |
| 6.3 | No "Ask me again" by voice and no undo of a change (spec §6.1.3, §14.2) | Changing the profile by voice belongs to the full live session; changes are logged on the server but not shown |
| 6.5, 6.6 | Three roles (friend, teacher, exam coach); no role-play, course companion or custom role, no accent choice | Each needs its own instructions and, for role-play, scenarios (spec §6.3); accents depend on the voice provider |
| 6.6 | Voices are listed by the provider's own names, without a description | A sample says more than an adjective would, and none was verified |
| 6.6 | "At the end" corrections are one sentence in the partner's goodbye | The call closes a few seconds after the goodbye (the worker's grace period) |

## Visual language (v2)

- Graphite and stone surfaces with one deep-teal accent (`primary`: `#0F766E` light,
  `#14B8A6` dark). No purple, indigo, lavender, gradients or glows.
- Lexend SemiBold for titles (28/34), Inter for interface text (16/24 body).
- 54 pt buttons (radius 14), 52 pt fields (radius 12), 44 pt minimum touch target.
- Warnings amber, success green, errors red; learner mistakes use the amber "Let's polish this"
  chip, never red.

## Adapting the phone mockups to other sizes

The canvas draws a 390 × 844 phone. The app keeps that look on every window through
`HeroLayout` and `src/lib/layout.ts`: stacked on phones (hero ≈ 56% of a tall window), actions
pinned at the bottom, content scrolling on short windows or at large text sizes, and hero beside
text on landscape tablets and desktop.
