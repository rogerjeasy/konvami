# Konvami — Section 2 · Create account (design)

> **Status:** Draft for review, 2026-10-09. Approved in conversation; this file is the written version.
> **Scope:** Screens 2.1–2.7 with real accounts on Amazon Cognito (email + password + 6-digit code).
> **Parent spec:** `2026-10-06-language-companion-app-design.md` (§6.1, §6.21, §10.2, decisions D4, D10, D15, D16).
> **Design source:** the 6 October 2026 copy of the design canvas (see §2). The live canvas could not be opened on 2026-10-09.

---

## 1. Goal and success criteria

A new user can go from **Welcome → Get started** to a verified Konvami account, give AI consent, answer
the microphone prompt and land on **All set**, on iOS, Android and the web preview.

Done means:

1. Screens 2.1–2.7 match the designs in light and dark, in English, German, French and Italian.
2. A real sign-up against the dev user pool works end to end: the code email arrives, the code
   verifies, the user is signed in, and the consent choices are stored on the account.
3. Closing and reopening the app keeps the user signed in and resumes at the right place.
4. Typecheck, lint, tests and `terraform validate` pass, and the screens pass the visual check in
   AGENTS.md rule 2.6 (five sizes, both themes, no overflow, main action reachable).

## 2. Design source

| Screen | Design file | Route |
| --- | --- | --- |
| 2.1 Age check | `AgeGate.dc.html` | `/age-check` (exists as a placeholder) |
| 2.2 Create account | `SignUp.dc.html` | `/create-account` |
| 2.3 Sign up with email | `EmailSignUp.dc.html` | `/sign-up-email` |
| 2.4 Verify email | `VerifyCode.dc.html` | `/verify-email` |
| 2.5 AI data consent | `AIConsent.dc.html` | `/ai-consent` |
| 2.6 Microphone | `MicPermission.dc.html` | `/microphone` |
| 2.7 All set | `AccountReady.dc.html` | `/all-set` |
| Under 16 (not drawn) | none | `/age-restricted` |

- The files are a copy taken on 2026-10-06 and use the v2 palette. Anything changed on the canvas
  after that date is not reflected here.
- The copy lives only in a temporary folder. **First implementation step:** save it in the repo as
  `docs/design/canvas-2026-10-06/` so the reference survives a reboot.
- Values (colors, sizes, type) come from `@konvami/design-tokens`, never from the canvas files.

## 3. Decisions

| # | Decision | Reason |
| --- | --- | --- |
| C1 | **Real accounts now**, on Cognito in eu-central-1 | Your choice; Cognito is the planned auth (§10.2) |
| C2 | **Email + password + 6-digit code**, as drawn. The parent spec's "magic link" (§6.21.1) is superseded for sign-up; §6.21.1 gets a note when this is built | The designs are the approved source for screens |
| C3 | **A small typed client over Cognito's HTTPS API**, behind an `AuthProvider` interface. No Amplify | No native module: works in Expo Go, web and tests. Provider is swappable (§15) |
| C4 | **Apple and Google are drawn but not active.** Tapping shows a short notice. Terraform inputs for both are prepared and empty | No Apple Developer membership or Google OAuth client yet |
| C5 | **The age check runs on the device.** The birthday never leaves the phone; only an age bracket is stored | Data minimisation; the design promises "we only use this to confirm your age" |
| C6 | **Consent and sign-up choices are stored as Cognito custom attributes** until the profile database exists | There is no backend database yet; the record must live with the account |
| C7 | **Password sign-in uses `USER_PASSWORD_AUTH` over TLS**, not SRP | The password already travels to Cognito at sign-up; SRP would add a crypto dependency for no real gain here |

## 4. User flow

```
Welcome ─ Get started ─► 2.1 Age check ──(under 16)──► Age restricted ─► Welcome
                              │ 16+
                              ▼
                         2.2 Create account ─ Continue with email ─► 2.3 Sign up with email
                              │ Apple / Google: "available soon" notice        │ Create account
                              │ Sign in ─► /sign-in (placeholder)              ▼
                                                                         2.4 Verify email
                                                                               │ code accepted, signed in
                                                                               ▼
                                              2.5 AI consent ─► 2.6 Microphone ─► 2.7 All set
```

- The progress header shows **1 of 4** (2.1), **2 of 4** (2.2 and 2.3), **3 of 4** (2.4) and
  **4 of 4** (2.5). Screens 2.6 and 2.7 have no progress header, as drawn.
- **Back** goes to the previous screen and keeps what was typed. On 2.5 the user is already signed
  in: Back returns to Welcome and keeps the session, and **Get started** then resumes at 2.5.
- **On launch**, a stored session is restored before the first screen:
  - signed in, no AI consent yet → 2.5 AI consent;
  - signed in with consent → the placeholder screen, which gains a **Sign out** button for testing;
  - not signed in → the existing first-launch flow.

## 5. Screens

Each screen is a body in `src/screens/create-account/<name>/` rendered by a one-line route file.
Content enters with `Reveal` in a stagger; Reduce Motion gets fades only.

### 2.1 Age check

- Three read-outs (Day, Month, Year) above a three-column wheel. Month names come from `Intl`.
  Days follow the chosen month and year. Years run from this year back 100 years.
- Tapping a read-out highlights it and its wheel column (the focus ring in the design).
- **Continue is disabled until the user has moved the wheel**, so nobody passes on a default date.
- 16 or older on today's date → 2.2. Younger → Age restricted.
- Each wheel column is an adjustable control for screen readers (increment and decrement actions).

### Age restricted (not drawn)

A plain screen in the same style: title, one sentence ("Konvami is for learners aged 16 and over"),
and a button back to Welcome. No error color, nothing stored. Known limit: the user can go back and
enter a different date; the stores ask for a gate, not identity verification.

### 2.2 Create account

- Logo tile, title, text, then three buttons: Apple, Google, email. Apple's button is black in light
  mode and white in dark, as drawn.
- Apple and Google: an inline notice appears under the buttons ("Apple sign-in is coming soon. Use
  email for now."). Which providers are active comes from `EXPO_PUBLIC_AUTH_PROVIDERS` (empty today).
- "Your data is hosted in the EU" notice, "Already have an account? Sign in", and the legal line
  with **Terms of Use** and **Privacy Policy** links (§10, open items).

### 2.3 Sign up with email

- Fields: first name, email (a check mark appears when the address is well formed), password with
  show/hide.
- Password rules shown as chips: **8+ characters**, **a number**, **a symbol**. The Cognito password
  policy enforces exactly these three.
- Strength meter with four segments: one per rule met, the fourth when all three are met and the
  password has 12 or more characters. Amber up to two segments, green from three ("Strong").
- "Learning tips by email" switch, off by default.
- **Create account** is disabled until all three fields are valid, and shows progress while the
  request runs.

### 2.4 Verify email

- Six boxes backed by one hidden numeric input, so the system can offer the code from Mail or
  Messages (one-time-code autofill) and paste works.
- **Verify email** is disabled until six digits are entered.
- "Resend code in 0:59" counts down from 60 seconds, then becomes a **Resend code** link.
- **Change email** returns to 2.3 with the fields kept.
- **Open Mail app** opens the inbox on iOS and Android. It is hidden where no mail app can be
  opened (web).
- On success the app signs in with the email and password still held in memory, then goes to 2.5.

### 2.5 AI data consent

- One card with three rows: **OpenAI** (required, switch locked on), **ElevenLabs** and
  **AWS Bedrock** (optional, switches on as drawn; see open item O1).
- **Agree and continue** stores the choices on the account (§7) and goes to 2.6.
- **Read the full privacy notice** opens the Privacy Policy link.

### 2.6 Microphone

- Built on the existing `HeroLayout`: rings and a microphone disc in the hero, with a gentle ripple
  `Loop`; the close button in the hero does the same as **Not now**.
- **Allow microphone** asks the system permission (`expo-audio`). Granted, refused or **Not now**
  all continue to 2.7; a refusal is never an error. Text mode covers it later.
- The iOS purpose string is set through the `expo-audio` config plugin, in all four languages.

### 2.7 All set

- Hero on the splash color with the logo mark and a "Hallo, {name}!" bubble, which pops in once
  with a success haptic.
- Title "You're all set, {name}", the Mia card with an **AI** badge, and the "7 days of Plus" line
  (see open item O2).
- **Start talking with Mia** and **Set up with a form instead** both lead to the placeholder until
  onboarding (§6.1 of the parent spec) is built.

## 6. App architecture

```
src/app/                         one route file per screen (routes only)
src/screens/create-account/      screen bodies and their private parts
src/components/                  new shared, presentational pieces (below)
src/auth/                        the auth module (below)
src/lib/validation.ts            pure rules: age, email, password strength, code (unit tested)
src/lib/routes.ts                the new routes
src/i18n/locales/*               all new strings, four languages
packages/design-tokens           new tokens only where the palette lacks them
```

### 6.1 New shared components

| Component | Used by | Notes |
| --- | --- | --- |
| `StepHeader` | 2.1–2.5 | Round back button, four progress segments, "n of 4". Read as "Step 2 of 4" |
| `TextField` | 2.3 | 52 pt field, label, focus ring, trailing slot (check mark, show/hide), error text |
| `PasswordStrength` | 2.3 | Meter and rule chips; takes the result of the pure rule function |
| `Switch` | 2.3, 2.5 | 51 × 31 pt, `role="switch"`, locked state for "required" |
| `WheelPicker` | 2.1 | One snapping column; the age screen composes three |
| `CodeInput` | 2.4 | Six boxes over one hidden input |
| `NoticeBox` | 2.1, 2.2, 2.5 | Icon and text on `surface` or `primary-soft` |
| `Button` (extended) | all | New `leading` icon slot and a `loading` state; a provider look for Apple |
| `Icon` (extended) | all | New glyphs: lock, shield, mail, eye, eye-off, mic, volume, file, clock, keyboard, gift, external link, info, chevron-left |

New tokens: the Apple button pair (black/white, swapped per theme), the Google mark's four brand
colors, Mia's avatar color, the code-box and switch sizes. Everything else is already in the palette
(`field`, `focus`, `danger*`, `disabled*`, `track`).

### 6.2 The auth module (`src/auth/`)

| File | Responsibility |
| --- | --- |
| `types.ts` | The `AuthProvider` interface and `AuthError` (a code, never a raw provider message) |
| `cognito-client.ts` | One function that posts to Cognito's HTTPS API with an injectable `fetch`, and maps Cognito error types to `AuthError` codes |
| `cognito-provider.ts` | `AuthProvider` implemented with `SignUp`, `ConfirmSignUp`, `ResendConfirmationCode`, `InitiateAuth`, `GetUser`, `UpdateUserAttributes`, `RevokeToken` |
| `session.ts` | The signed-in state (same store pattern as `src/preferences`), restore at launch, refresh, sign out |
| `config.ts` | Reads `EXPO_PUBLIC_AUTH_REGION`, `EXPO_PUBLIC_AUTH_CLIENT_ID`, `EXPO_PUBLIC_AUTH_PROVIDERS` |
| `sign-up-draft.tsx` | In-memory state shared by 2.1–2.4 (age bracket, name, email, password, tips choice) |

```ts
interface AuthProvider {
  signUp(input: { email; password; firstName; locale; ageBracket; tipsOptIn }): Promise<void>;
  confirmSignUp(email: string, code: string): Promise<void>;
  resendCode(email: string): Promise<void>;
  signIn(email: string, password: string): Promise<Session>;
  refresh(refreshToken: string): Promise<Session>;
  saveAiConsent(session: Session, consent: AiConsent): Promise<void>;
  getUser(session: Session): Promise<User>;
  signOut(session: Session): Promise<void>;
}
```

Screens call the interface only. Tests use a fake provider.

**Session storage**

- The refresh token and a small user summary are kept in the Keychain / Keystore (`expo-secure-store`,
  this device only). Access and ID tokens stay in memory and are renewed with the refresh token.
- On the web preview the session is kept in memory only.
- The password is held in memory from 2.3 until the automatic sign-in after 2.4, then dropped. It is
  never written to storage or logs.
- Sign out revokes the refresh token and clears storage.

## 7. Data stored on the account

| Attribute | Value | Set when |
| --- | --- | --- |
| `email` | Sign-in name, verified by code | Sign-up |
| `given_name` | First name | Sign-up |
| `locale` | App language at sign-up (for localised emails later) | Sign-up |
| `custom:age_bracket` | `16-17`, `18-24`, `25-34`, `35-44`, `45-54`, `55-64`, `65+` | Sign-up |
| `custom:tips_optin` | `1` or `0`, with the date | Sign-up |
| `custom:ai_consent` | Consent text version, timestamp, and `1`/`0` per provider | 2.5 |

- The birthday itself is not stored anywhere.
- These custom attributes move to the Learner Configuration Profile when the database exists. Cognito
  does not allow removing a custom attribute from a pool, so the three names are permanent.

## 8. Errors

Messages are inline, in all four languages, in the red field style of design 3.2. They never show a
raw provider message.

| Situation | What the user sees |
| --- | --- |
| Email already has a verified account | Under the email field: "This email already has an account", with a **Sign in** link |
| Email has an unfinished sign-up | A new code is sent and the flow continues at 2.4. If the automatic sign-in then fails because the password differs, the user is sent to Sign in |
| Wrong code | Boxes turn red: "That code isn't right. Check it and try again" |
| Expired code | "That code has expired", with **Resend code** available at once |
| Too many attempts or requests | "Too many tries. Wait a few minutes and try again" |
| Password rejected by the server | Under the password field: "Choose a different password", with the rule chips re-checked |
| No network or timeout | "Can't reach Konvami. Check your connection", with the button ready to retry |
| Auth settings missing (`.env` not filled) | A clear developer message on 2.3; the first-launch screens still work |

## 9. Infrastructure (Terraform)

New module `infra/modules/auth`, wired in `infra/envs/dev/main.tf`. All resources are named `kv-dev-*`,
tagged `Project=konvami`, in eu-central-1. Nothing of NextChronicle's is touched.

| Resource | Settings |
| --- | --- |
| User pool `kv-dev-users` | Essentials plan · email as the sign-in name, case-insensitive · email verified by 6-digit code · password policy: 8+ characters, a number, a symbol · the three custom attributes · MFA off · account recovery by verified email · deletion protection on |
| App client `kv-dev-mobile` | Public (no secret) · password and refresh-token flows only · token revocation on · access and ID tokens 60 minutes, refresh token 30 days · may read and write only the attributes in §7 |
| Email | Cognito's built-in sender (`no-reply@verificationemail.com`) with a short English message ("Your Konvami code is 123456") |
| Apple / Google (inactive) | Optional variables, `null` by default. When filled they create the identity providers and the hosted sign-in domain. Validated but not applied in this step |

- **Outputs:** the pool id, client id and region, plus a `mobile_env` output that prints the
  `EXPO_PUBLIC_*` lines for `apps/mobile/.env`. None of these are secrets.
- **Cost:** $0 at this scale. Essentials is free for the first 10,000 monthly active users; the
  built-in email sender is free.
- **Process:** `terraform plan -out=tfplan`, the plan is shown to you, and it is applied only after
  you approve it.

## 10. Open items and known limits

| # | Item | Proposal |
| --- | --- | --- |
| O1 | **Optional AI providers are switched on by default** in the design. Under GDPR, a pre-selected optional choice is weak consent | Build as drawn now; decide before public launch whether ElevenLabs and Bedrock should start switched off |
| O2 | **"7 days of Plus" is shown but no trial exists yet** (RevenueCat comes later) | Show the line as drawn; it becomes true when subscriptions are built. Remove it if you prefer not to promise it yet |
| O3 | **Terms of Use and Privacy Policy pages do not exist** | Links read `EXPO_PUBLIC_TERMS_URL` and `EXPO_PUBLIC_PRIVACY_URL`; until the site exists they open the placeholder. Needed before any tester outside your own circle signs up |
| O4 | **The code email is in English, from a generic AWS address**, and may land in spam. The built-in sender also has a low daily limit | Fine for dev. Own domain with Amazon SES and localised emails come before public launch |
| O5 | **The sign-up endpoint is public**, so anyone with the client id could create accounts or trigger code emails | Cognito's built-in throttling plus the low email limit cap this in dev. Add AWS WAF or Cognito threat protection before launch |
| O6 | **Refresh tokens can be larger than the size `expo-secure-store` is documented to handle** on some devices | Checked first in the plan; if needed the token is split across two keys |
| O7 | **Signing in again is not possible until section 3** | The session lasts 30 days and survives restarts. Sign out is only on the placeholder screen |

## 11. Not in this step

- Section 3 (Sign in and recovery), including magic link, Face ID and password reset.
- The app-side Apple and Google sign-in flow. It needs your credentials and a development build, so
  it is built and tested together with them.
- Mia's conversational onboarding and the form alternative.
- Account deletion, the profile database, subscriptions and the trial.
- Localised and branded emails.

## 12. Testing

| Level | What |
| --- | --- |
| Unit | Age on a given date (leap years, birthday today), email format, password rules and strength, code format · the Cognito client against a mocked `fetch`: request shape, every error mapping, timeouts · session restore, refresh and sign out |
| Screen (Testing Library) | The main path of each screen with a fake provider, plus: under 16, email already used, wrong code, resend timer, mic refused |
| i18n | The existing test that all four locales have the same keys |
| Tokens | The existing contrast test, extended to the new pairs |
| Terraform | `terraform fmt -check`, `terraform validate`, and the plan reviewed by you |
| Visual | Playwright at 390 × 844, 320 × 568, 820 × 1180, 1180 × 820 and 1440 × 900, light and dark, also at large text size |
| End to end | One real sign-up against the dev pool from the web preview and from your iPhone: code email received, account verified, attributes stored, session kept after restart |

## 13. What is needed from you

- An active `nc-dev` sign-in (`aws sso login --profile nc-dev`) when the Terraform step runs.
- Approval of the Terraform plan before it is applied.
- A decision on O1 and O2 before public launch (neither blocks this step).

## 14. As built (2026-10-09)

Built test-first, directly from this design (no separate plan document, at your request). What
differs from the sections above:

| Topic | As built |
| --- | --- |
| Email sign-up fields (§5, 2.3) | First name, email, password and **confirm password** (added at your request; the design draws one password field). Sign-up stays off while the two differ |
| Apple and Google (§3 C4, §9) | **Placeholders only.** Tapping one shows the "coming soon" notice. There is no `EXPO_PUBLIC_AUTH_PROVIDERS` setting and no Terraform input for them yet; both arrive with the real sign-in flow |
| Password symbols (§5, 2.3) | The "A symbol" chip accepts exactly the characters Cognito's policy accepts, so the chip and the server never disagree |
| Session restore (§4) | Only a refused refresh token signs the user out at launch. Offline or a server error keeps them signed in from the saved copy |
| Saved session (§10 O6) | The saved record is always split into parts of at most 1,800 characters, so a large refresh token is never refused by the Keychain |
| Hero screens (§5, 2.6 and 2.7) | `HeroLayout` takes a `heroShare`, so these two use the shorter hero drawn for them, and their drawings shrink on short windows |
| Design copy (§2) | Saved in `docs/design/canvas-2026-10-06/` |

Still open, exactly as in §10: O1 (optional AI providers default to on), O2 (trial line), O3 (legal
pages), O4 (email sender and language), O5 (public sign-up endpoint), O7 (no sign-in until section 3).
