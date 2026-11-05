# Store release material

Everything needed to put Konvami in the App Store and Google Play that can be prepared in the
repository. Written 2026-11-05. Design note: `docs/superpowers/specs/2026-11-06-store-listings-design.md`.

| File                                                   | What it is                                                                                |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| [`claims.md`](claims.md)                               | What a listing may say today, what it must not, and the trademark note                    |
| [`listings/`](listings)                                | Store text in `en`, `de`, `fr`, `it`; `pnpm check:store` checks the limits                |
| [`privacy-labels.md`](privacy-labels.md)               | App Privacy and Data safety answers, from the database and the code                       |
| [`compliance.md`](compliance.md)                       | Age rating, Google's AI-content policy, Apple 5.1.2(i), DSA, review risks, reviewer notes |
| [`screenshots-and-video.md`](screenshots-and-video.md) | Sizes, the shot list and the preview-video outline                                        |
| [`release-checklist.md`](release-checklist.md)         | Every step to release, each marked done, needs owner or needs code                        |

Placeholders the owner must fill are written `OWNER-TO-FILL`. No real name, address, phone number,
email, key or password is in this folder.

## Store limits used

| Field                      | App Store     | Google Play            |
| -------------------------- | ------------- | ---------------------- |
| App name                   | 30            | 30                     |
| Subtitle / short text      | 30 (subtitle) | 80 (short description) |
| Promotional text           | 170           | n/a                    |
| Description                | 4,000         | 4,000                  |
| Keywords                   | 100 bytes     | n/a                    |
| What's new / release notes | 4,000         | 500                    |

Read from Apple's "Platform version information" and Google's "Add preview assets" help pages on
2026-11-05. Those pages did not state the App Store name and subtitle limits (30 each) or Google's
release-notes limit (500): confirm those three in the console forms.
