# Screenshots and preview video

Written 2026-11-05. Sizes are the stores' requirements as last read; **confirm them in App Store
Connect and Play Console before capturing**, because both change them.

## Rules for every capture

- Real app, signed in as the demo account (see `compliance.md`), on a device or the simulator. No
  mock-ups of screens that do not exist, no invented features (`claims.md`).
- One set per store language (en, de, fr, it): switch the app language in Profile › Personal. The
  German practice content stays German; only the interface changes.
- Light mode for the main set. Dark mode can be a second set, with the same screens.
- The partner's drawn portrait is fine. Use no photo of a real person and no real learner's data.
- Take the status bar clean: full battery, no notifications, a plain time.
- Text overlays and frames are allowed, but must not hide the app or claim more than it does.

## Sizes

| Store / device                                 | Size (px)                                                                 | Count          |
| ---------------------------------------------- | ------------------------------------------------------------------------- | -------------- |
| App Store, iPhone 6.9" (iPhone 16/17 Pro Max)  | 1320 × 2868 (or 1290 × 2796)                                              | 1 to 10, use 8 |
| App Store, iPad 13" (the app supports tablets) | 2064 × 2752                                                               | 1 to 10, use 5 |
| Google Play, phone                             | 9:16, each side 320 to 3840 px; use 1080 × 1920 or larger                 | 2 to 8, use 8  |
| Google Play, 7" and 10" tablet                 | Optional but advised; same rules                                          | up to 8, use 4 |
| Google Play, feature graphic                   | 1024 × 500, no transparency                                               | 1 (required)   |
| Google Play, icon                              | 512 × 512 PNG                                                             | 1 (required)   |
| App Store icon                                 | 1024 × 1024, no transparency or rounded corners (`assets/brand/icon.png`) | in the build   |

The Play icon and feature graphic come from the brand files in `design/brand/konvami/` (the v2
logo: solid teal tile, no gradient). Regenerate with `pnpm brand:export`; the feature graphic is a
new layout to design (**OWNER-TO-FILL**: approve it).

## Shot list (same order for every size and language)

| #   | Screen                               | Show                                                      | Caption idea (en)                     |
| --- | ------------------------------------ | --------------------------------------------------------- | ------------------------------------- |
| 1   | 5.3 Conversation, a call in progress | Partner's portrait, a line of German, one correction chip | Talk out loud. Get gentle corrections |
| 2   | 5.10 Session report                  | Corrections, new words, next steps                        | A report after every conversation     |
| 3   | 5.1 Today                            | The week's plan and the main button                       | A plan for your week                  |
| 4   | 5.13 Role-plays                      | The list of situations                                    | Rehearse real life                    |
| 5   | 5.11 Review                          | A flashcard with "Answer out loud"                        | Words you keep                        |
| 6   | 5.14 Grammar map                     | Topics with how well they are used                        | See what to practise                  |
| 7   | 5.16 Exam centre                     | The test formats and a score estimate                     | Practise for your speaking test       |
| 8   | 5.8 Progress                         | Level, minutes, milestones                                | See your progress                     |

iPad: shots 1, 2, 3, 6, 8. The side rail on wide windows (design README, row 5) shows well here.

Do **not** make a screenshot of prices, a free trial, a pen-pal chat or a pronunciation score.

## Checks before upload

- Each image is the exact pixel size and has no alpha channel (App Store).
- The text on the screen matches the store language.
- Nothing in the frame is a "coming soon" notice or an error.
- The same app version is on the device as in the build under review.

## Preview video (optional but advised)

App Store: an app preview of 15 to 30 seconds, captured from the device, up to three per size.
Google Play: a YouTube link (public or unlisted), shown before the screenshots. The spec (§6.21.4)
suggests avatars help here.

Outline, 30 seconds, no voice-over needed (captions in the store language):

| Time     | Shot                                                                              | Caption (en)                      |
| -------- | --------------------------------------------------------------------------------- | --------------------------------- |
| 0 to 3   | Splash and the Today screen                                                       | Practise German by talking        |
| 3 to 14  | A real call: the learner speaks, the partner answers, a correction chip slides in | Corrections while you speak       |
| 14 to 20 | The report opens                                                                  | A report after every conversation |
| 20 to 25 | A role-play list, then a flashcard answered out loud                              | Role-plays. Flashcards.           |
| 25 to 30 | The exam centre, then the logo                                                    | Konvami. Your German partner      |

Record the call with the device's screen recorder with the microphone on. **Do not show private
data**, and do not speak anything you would not want published. Keep the real latency: do not cut
the partner's pauses to make it look faster.
