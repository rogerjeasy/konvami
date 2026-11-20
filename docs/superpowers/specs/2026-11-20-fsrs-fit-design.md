# A card schedule fitted to each learner (5.11, spec §6.7)

Gap 19 of `docs/research/2026-11-20-competitor-gap-analysis.md`: Anki fits FSRS to each user's own
reviews; Konvami scheduled every learner with the published FSRS-6 defaults, although it kept every
review from the first one on (`card_review`). This note records how the fit works and the calls I
made ("my call").

## What the learner sees

Nothing changes until they have logged 1,000 reviews. From then on, at most once a week, opening a
review session (5.11) has their log fitted in the background. When the fit is kept, 5.7 Learn says
under the deck's numbers, in the subtle tone: "Your schedule is tuned to you: cards come back when
you would just about forget them." Cards simply come back at better moments; nothing else moves.

## How it works

- **`domain/fsrs.py`** takes the 21 parameters as an argument everywhere (`weights`, default the
  published ones) and the target retention for `interval_days` (default 0.9, unchanged).
- **`domain/fsrs_fit.py`**, pure Python:
  1. *Pretraining*: a new card's stability for each first rating is fitted from the card's second
     review a day or more later (golden-section search on the log loss), averaged in log space with
     the default as if the default were 30 reviews, and kept in order (again ≤ hard ≤ good ≤ easy).
     A rating with fewer than 30 such cards keeps its default.
  2. *Descent*: the other 17 parameters move by Adam (learning rate 0.04 falling to 0.004 on a
     cosine, 64 steps) on a forward-difference gradient of the mean log loss of every review a day
     or more after the one before, plus a gentle pull (0.05 per squared share of a parameter's
     range) back to where the fit started. Parameters are kept within bounds close to the
     reference optimiser's clipping.
  3. *Guard*: every fifth card (by its place in the log) is held back. The fitted parameters are
     kept only when their log loss on those cards is at least 0.5% lower than the defaults'. A fit
     that is not kept leaves the learner on the defaults; it is tried again a week later.
- **`domain/card_schedule.py`** decides when to fit (`maybe_fit`, from `CardService.queue`), runs
  the fit in the worker (`card_schedule` job, `LambdaFitStarter`) and serves the learner's weights.
- **`card_schedule` table** (migration 0280): the last attempt, the weights (JSON, null for the
  defaults), and the two held-out losses. In the data export (6.19); deleted with the account.
- **`CardService`** schedules every review, the queue's "due in" times, offline syncs and words
  reviewed in a conversation with the learner's weights.
- **API**: `GET /v1/cards/ahead` carries `weights` (null for the defaults) and `retention`;
  `GET /v1/cards` carries `scheduleTuned`.
- **App**: the offline cache keeps `weights` and `retention` from `ahead`, and
  `offline/scheduler.ts` takes them, so a card reviewed offline lands where the server would put
  it. `tests/fixtures/fsrs_fitted_cases.json` (written by `tests/domain/fsrs_cases.py`) holds 40
  histories scheduled with a set of fitted parameters and a retention of 0.85; the server's and the
  app's tests both check against it, as they do for the defaults.

## My calls

- **No library.** The PyPI `fsrs` package's optimiser needs PyTorch, far too large for the API's
  Lambda; `fsrs-rs-python` is a native Rust wheel, a new binary supply-chain dependency for one
  weekly job. A pure-Python fit takes about 3 ms per pass over 3,000 reviews, so a full fit is a
  few seconds, and at most about two minutes for the largest log read (2,000 cards).
- **Threshold: 1,000 reviews** (all languages together). Anki's guidance for its optimiser is about
  a thousand; fewer and the fit mostly learns noise. The held-out guard protects below and above it.
- **Per learner, not per language.** A learner's memory is theirs; splitting by language would
  delay the fit for anyone learning two languages. Revisit if the data says languages differ.
- **The four first-rating stabilities are not moved by the descent.** They are measured directly by
  the pretraining; letting the descent move them made a card first rated "hard" more stable than
  one rated "good" in tests, which cannot be right.
- **The fitted parameters are those fitted on four fifths of the cards**, not refitted on all after
  the check, so what is used is exactly what was checked.
- **Triggered by opening a review session**, not by every review: one database read per session,
  no new AWS resource (the existing worker function and its asynchronous invocation).
- **Retention stays 90%**, configurable on `CardService(retention=…)` and sent to the phone; a
  learner-facing retention setting was not added.
- **The learner is told once, quietly**, on 5.7 Learn; no notification and no celebration: it is a
  better schedule, not an achievement.

## Verified, not verified

- Verified by tests: on a simulated learner who forgets twice as fast and builds stability more
  slowly, the fit lowers held-out log loss from 0.528 to 0.498 (the true parameters give 0.497) and
  moves the stability-growth parameter towards the truth; on a simulated average learner the fit is
  not kept; storage on PostgreSQL; the API; the worker dispatch; app/server parity on fitted
  parameters; the offline queue using them; the line on 5.7.
- Not verified: fits on real learners' logs (nobody has 1,000 reviews yet), and the run time of the
  largest fit on Lambda. The bounds are close to, not checked against, the reference optimiser's.
