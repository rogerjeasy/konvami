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
