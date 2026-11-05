# Store listings and release readiness (spec §6.21.3 to §6.21.6, §18 Phase 3)

> **Parent spec:** `2026-10-06-language-companion-app-design.md`. **Written:** 2026-11-05.
> **Scope:** what can be prepared in the repository for the App Store and Google Play. No new
> app feature. The material is in `docs/store/`.

## What was built

| Piece                    | Where                                                    |
| ------------------------ | -------------------------------------------------------- |
| Listing text, 4 languages | `docs/store/listings/{en,de,fr,it}.md`, checked by `pnpm check:store` (`scripts/check-store-listings.mjs`) |
| What may be claimed      | `docs/store/claims.md`, drawn from the design README's tables |
| Privacy labels           | `docs/store/privacy-labels.md`, from the migrations, the code and the privacy policy |
| Compliance and review    | `docs/store/compliance.md`                               |
| Screenshots and video    | `docs/store/screenshots-and-video.md`                    |
| Release checklist        | `docs/store/release-checklist.md`                        |
| App config               | `apps/mobile/app.config.ts`, `apps/mobile/eas.json`      |

## Decisions

| #   | Decision                                                                                  | Reason                                                                                   |
| --- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| K1  | The listing describes only built features; a table of what must not be claimed sits beside it | Reviewers compare the text with the app; unbuilt features (plans, pen-pal, pronunciation, avatars) are the usual reason for rejection |
| K2  | One description text for both stores, a separate short text for Google Play               | Both allow 4,000 characters; Google adds an 80-character short description                |
| K3  | The limits are checked by a script, not by eye                                            | Four languages and ten fields each; German and French went over on the first run          |
| K4  | `expo-audio` background playback is off                                                   | The plugin's default added iOS's `audio` background mode and Android's media foreground-service permissions. Background audio is for hands-free mode (spec §6.3), which is not built, and the stores ask for a justification |
| K5  | `READ_EXTERNAL_STORAGE` and `WRITE_EXTERNAL_STORAGE` are blocked                          | The photo is chosen with the system picker, which needs no storage access; Google reviews every storage permission |
| K6  | An iOS privacy manifest is declared in `app.config.ts` (`PRIVACY_MANIFEST`)                | Required since 2024: no tracking, the nine data types the app collects, and the required-reason APIs React Native and Expo use. Checked in a generated project (`PrivacyInfo.xcprivacy`, ATS arbitrary loads off, no background mode) |
| K7  | A `production` build profile (store distribution, Android app bundle, auto-incremented build numbers) and an empty `submit.production` | Only `preview` existed. Build numbers stay with EAS (`appVersionSource: remote`). Store ids and keys are the owner's and are not committed |
| K8  | The mismatches between the app and the policy are listed, not fixed here                  | They are text in the sign-up flow and the legal pages, which other work is changing (RevenueCat, legal pages, moderation) |

## Found while preparing it

1. `all-set.tsx` (2.7) promises a 7-day Plus trial that does not exist.
2. 2.6 says text mode is always available; no typed practice mode was found.
3. The privacy policy says there are no analytics tools and does not name Expo's push service, which
   receives the push token since push shipped.
4. Apple and Google sign-in buttons show "coming soon".
5. Only `infra/envs/dev` exists: a store build would talk to the development stack.

All five are in `docs/store/release-checklist.md` (B2, C1, D1 to D3).

## Not done

Nothing was submitted to a store. Screenshots, the feature graphic and the video are described, not
produced. The three limits the stores' pages did not state (App Store name and subtitle, Google
release notes) are to be confirmed in the consoles. The owner's name, address, phone, support email
and accounts are `OWNER-TO-FILL`.
