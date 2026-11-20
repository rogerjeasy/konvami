# Release checklist

Written 2026-11-05, brought up to date 2026-11-20 (spec §6.21.3 to §6.21.6, §18 Phase 3, §21.3).
Status words:

- **done**: finished and in the repository;
- **needs owner**: only the owner can do it (an account, a payment, a legal choice, a secret);
- **needs code**: a feature or fix in this repository, not done yet;
- **needs both**: code first, then the owner.

Nothing below is a secret. Store credentials and keys go into EAS and the store consoles, never into
the repository (`AGENTS.md` §1.4).

**Where it stands (2026-11-20):** every "needs code" row of 2026-11-05 is done except the
production stack (C1). What is left is the owner's: accounts, the controller's details, credentials,
the store forms and the testing tracks.

## A. Accounts and names

| #   | Step                                                                                                                                                    | Status      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| A1  | Enrol in the **Apple Developer Program** as an individual (fee per year). Without it: no TestFlight, no App Store, no APNs key                          | needs owner |
| A2  | Create a **Google Play Console** developer account (one-off fee) and verify identity                                                                    | needs owner |
| A3  | Apply for the **Apple Small Business Program** (15 % fee) and check Google's 15 % tier                                                                  | needs owner |
| A4  | Decide **EU trader status** and the public address, phone and email the stores will show (`compliance.md` §6)                                           | needs owner |
| A5  | Register the Konvami **domains**; file the **Swiss (IPI)** and **EU (EUIPO)** trademarks; reserve the name "Konvami" in both consoles (spec §21.3)      | needs owner |
| A6  | Set up a **support email** that is not personal, and set `EXPO_PUBLIC_SUPPORT_EMAIL` in EAS (6.20 shows the support row only then)                      | needs owner |
| A7  | Choose the first **African markets** and check each country's data law (spec §21.3, §6.21.6). Not needed for the Switzerland, Germany and France launch | needs owner |
| A8  | Decide who commissions the **avatar art** (spec §21.3). Not a store blocker: the drawn avatars ship today                                               | needs owner |

## B. Legal pages and policies

| #   | Step                                                                                                                                                                                                | Status                                                                                           |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| B1  | Fill the **controller name, address and email** in `apps/site/site.config.ts` (the site refuses to build and `pnpm legal:check` fails while one is empty)                                           | needs owner                                                                                      |
| B2  | Name **Expo's push service** in the privacy policy, in all four languages                                                                                                                           | done (`apps/site/content/privacy/*.md`)                                                          |
| B3  | **Terms of use** in four languages on the site                                                                                                                                                      | done (`apps/site/content/terms/*.md`); the owner reads them, a lawyer reviews them               |
| B4  | Host the site on a domain; set `EXPO_PUBLIC_PRIVACY_URL` and `EXPO_PUBLIC_TERMS_URL` (with `{lang}`) in the EAS `production` environment                                                            | needs owner (the site is built; `publish_site` in Terraform, then the domain)                    |
| B5  | Enter the **privacy policy URL** in App Store Connect and Play Console                                                                                                                              | needs owner                                                                                      |
| B6  | **Account deletion web page** for people who uninstalled (Google requires its URL in the Data safety form)                                                                                          | done (`/public/delete-account`, `services/api` `api/deletion_page.py`); the owner enters the URL |
| B7  | Data processing agreements in place with AWS and OpenAI, and with each optional provider turned on (ElevenLabs, Sentry, PostHog, RevenueCat, Microsoft Azure Speech); check no-training and regions | needs owner                                                                                      |

## C. Production backend and builds

| #   | Step                                                                                                                                                                                                                                                                                                                                                    | Status                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| C1  | **A production stack.** Only `infra/envs/dev` exists. Store builds must not point at `kv-dev-*`. Create `infra/envs/prod` through Terraform (plan, show, then apply), with its own Cognito pool, database and OpenAI key                                                                                                                                | needs both                                  |
| C2  | Create the EAS **`production` environment** and set `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_AUTH_REGION`, `EXPO_PUBLIC_AUTH_CLIENT_ID` and the two legal URLs from C1 and B4 (public values). Leave `EXPO_PUBLIC_SHOW_PENDING_SIGN_IN` unset                                                                                                                | needs owner                                 |
| C3  | Production **build profile** (`store` distribution, auto-incrementing build numbers, `app-bundle` for Android)                                                                                                                                                                                                                                          | done (`apps/mobile/eas.json`)               |
| C4  | **Bundle ids**: `app.konvami` for iOS and Android (the development build is `app.konvami.dev`)                                                                                                                                                                                                                                                          | done (`app.config.ts`)                      |
| C5  | **Export compliance**: `ITSAppUsesNonExemptEncryption = false` (the app uses only the system's HTTPS and WebRTC encryption). Re-check if a library adds its own cryptography                                                                                                                                                                            | done (`app.config.ts`)                      |
| C6  | **iOS privacy manifest** with the collected data types and the required-reason APIs. Crash data, analytics and purchase history are declared only by a build that has the Sentry, PostHog or RevenueCat key (`src/lib/privacy-manifest.ts`)                                                                                                             | done, kept in step with `privacy-labels.md` |
| C7  | **Permissions**: microphone, camera (photographing material to import, 5.23), photo library and Face ID have purpose strings; overlay and storage permissions are blocked. Since 2026-11-05 calls can go on with the screen locked (opt-in walking mode): iOS background audio and Android foreground services of type `microphone` and `mediaPlayback` | done (`app.config.ts`); see C15             |
| C8  | **Version numbers**: build numbers and version codes come from EAS (`appVersionSource: remote`, `autoIncrement`); `version` is `1.0.0` for the first store release                                                                                                                                                                                      | done (`app.config.ts`)                      |
| C9  | Android **Firebase**: create the Firebase project, add the Android app `app.konvami`, upload `google-services.json` to EAS as the file variable `GOOGLE_SERVICES_JSON`, and the FCM credentials for Expo push                                                                                                                                           | needs owner                                 |
| C10 | iOS **APNs key**: create it in the Apple Developer account and upload it to EAS (`eas credentials`). Check that the store build's `aps-environment` is `production`                                                                                                                                                                                     | needs owner                                 |
| C11 | `eas submit` setup: App Store Connect app id (`ascAppId`) and the Google Play service-account key, added to `submit.production` or passed in EAS                                                                                                                                                                                                        | needs owner                                 |
| C12 | Build both store binaries once (`eas build --profile production`) and inspect them: no developer menu, no local-network prompt, only the permissions and background modes in C7                                                                                                                                                                         | needs owner (runs the build)                |
| C13 | Real **voice call** on a store build, on iOS and Android, including the recording upload checked in `docs/design/README.md` row 5.6 ("not yet tried with a real call")                                                                                                                                                                                  | needs owner                                 |
| C14 | **Latency** of voice from Switzerland, Germany and France during the beta (spec §6.21.6)                                                                                                                                                                                                                                                                | needs owner                                 |
| C15 | Play Console **foreground service declaration** for `microphone` and `mediaPlayback` (what the walking call does, with a short video), and the App Review note on background audio (`compliance.md` §7)                                                                                                                                                 | needs owner                                 |
| C16 | **Time-sensitive notifications** for partners' rings (5.28): store builds carry the entitlement `com.apple.developer.usernotifications.time-sensitive`; let EAS enable the capability on the App ID, then check on an iPhone that a ring shows at once and that a Focus stops it unless Konvami is allowed in it                                        | needs owner                                 |
| C17 | **Home-screen widget** (optional): `npx expo install expo-widgets`, write the widget's layout in `src/widgets/bridge.ts`, build with `KONVAMI_WIDGETS=1`, create the App Group `group.app.konvami` and the extension's App ID, and try it on both platforms (`docs/superpowers/specs/2026-11-20-partner-calls-design.md`)                               | needs both                                  |

## D. In-app fixes before review (`compliance.md` §5)

| #   | Step                                                                                                         | Status                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| D1  | Remove "7 days of Plus are on us" from 2.7 (four languages) until a trial exists                             | done: 4.8 offers a trial only when the store has one (`screens/plan/trial-offer.tsx`)                     |
| D2  | Hide the Apple and Google buttons and the sign-in-link row until they work (2.2, 3.1)                        | done: left out unless a build sets `EXPO_PUBLIC_SHOW_PENDING_SIGN_IN=true` (`src/lib/sign-in-methods.ts`) |
| D3  | Reword or build "Prefer typing? Text mode is always there" (2.6)                                             | done: "Prefer typing? Cards and Tutor questions work without the mic"                                     |
| D4  | Moderate the text users write for a persona (spec §6.21.4 abuse prevention)                                  | done (`services/api` `domain/moderation.py`)                                                              |
| D5  | Crash reporting and privacy-friendly analytics, if wanted; each one changes the labels (`privacy-labels.md`) | done, off unless the build has a key; turning one on changes the labels (C6, F3)                          |
| D6  | In-app **feedback form** and support route (spec §6.21.4)                                                    | done (6.20 Help and feedback, 6.21 Feedback inbox)                                                        |

## E. Subscriptions (only when selling)

| #   | Step                                                                                                                                                             | Status                                                                                    |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| E1  | RevenueCat account; products in App Store Connect and Play Console; CHF and EUR prices per storefront (spec §6.21.2, §6.21.6)                                    | needs owner                                                                               |
| E2  | RevenueCat in the app: purchase, **restore purchases**, trial terms, links to terms and privacy                                                                  | done (6.17 Plan, `src/plan`); off until `EXPO_PUBLIC_REVENUECAT_*_KEY` are set            |
| E3  | After E1: change the age-rating, Data safety ("Purchases") and App Privacy answers, add a subscription disclosure to the description, and re-capture screenshots | needs owner                                                                               |
| E4  | Server-side quotas tied to the subscription                                                                                                                      | done (`services/api` `domain/plans.py`); on when Terraform's `plans.enforce` is turned on |
| E5  | Store tax and banking forms                                                                                                                                      | needs owner                                                                               |

## F. Store listing

| #   | Step                                                                                                                        | Status                       |
| --- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| F1  | Listing text in en, de, fr, it, within the limits (`pnpm check:store`)                                                      | done (`docs/store/listings`) |
| F2  | Have a native speaker read the de, fr and it texts and the legal wording                                                    | needs owner                  |
| F3  | Fill App Privacy (App Store Connect) and Data safety (Play Console) from `privacy-labels.md`, for the keys the build has    | needs owner                  |
| F4  | Fill the age-rating questionnaires and the Play target audience (16 and over) from `compliance.md`                          | needs owner                  |
| F5  | Capture and upload screenshots, the feature graphic and the icon (`screenshots-and-video.md`)                               | needs owner                  |
| F6  | Reviewer notes and a **demo account** with this week's voice minutes (`compliance.md` §7); enter the notes in both consoles | needs owner                  |
| F7  | Support URL, marketing URL (optional), copyright line, category (Education), contact details for the reviewer               | needs owner                  |
| F8  | Decide whether the listing names the Goethe-Institut, telc and the DTZ (`claims.md`, "Trademarks")                          | needs owner                  |

## G. Testing tracks and release

| #   | Step                                                                                                                                                                                                        | Status      |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| G1  | **Google Play closed test**: a new personal account needs **at least 12 testers opted in for 14 continuous days** before it may apply for production. Start it as early as possible: it is the slowest step | needs owner |
| G2  | TestFlight **internal** testing (up to 100 people on the team, no review), then external testing (a light beta review)                                                                                      | needs owner |
| G3  | Recruit testers and keep them opted in; collect feedback from the in-app form (D6)                                                                                                                          | needs owner |
| G4  | Apply for Google production access after the 14 days; submit to App Store review                                                                                                                            | needs owner |
| G5  | Staged rollout: Switzerland, Germany, France first (spec §6.21.6), the rest of the EU later                                                                                                                 | needs owner |
| G6  | The owner reads the **Reports queue** (6.15) and answers flags, and watches the budget emails (target $150, ceiling $250)                                                                                   | needs owner |

## Critical path

G1 (14 days) cannot start until a Play account exists (A2), a closed-test build exists (C1, C2, C9)
and the privacy policy is online (B1, B4). Those four are the first things to do. Apple review
needs A1, C1, C10, C15's review note and the labels in F3.
