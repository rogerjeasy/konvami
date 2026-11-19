# Reviewing cards offline (5.7 Learn, 5.11 Review)

Spec §10.3 says flashcard review by tap works offline and syncs later; §6.7 names FSRS as the
scheduler. Before this note the app already kept the due cards it had read, scheduled a rating
with a TypeScript copy of FSRS and replayed ratings one card at a time (`expectedReviews`,
`reviewedAt` on `POST /cards/{id}/review`). This note finishes the feature.

## What changes

- **The cards of the coming week stay on the phone.** `GET /v1/cards/ahead` answers with the
  cards due within `OFFLINE_AHEAD` (7 days, at most `OFFLINE_MAX` = 300), each with its memory
  (stability, difficulty). The app reads it each time the review queue loads online and replaces
  its copy with it, so a card removed on another device is forgotten too. Offline, the queue is
  the copies due by the phone's clock.
- **One scheduler, checked on both sides.** `services/api/tests/fixtures/fsrs_cases.json` holds
  40 histories of 10 reviews (fixed seed), written from `domain/fsrs.py` by
  `python -m tests.domain.fsrs_cases`. The Python test fails when `fsrs.py` no longer gives the
  file's values; the app's `offline/scheduler.test.ts` replays the same file. Neither can change
  alone.
- **Ratings are sent in one batch, once.** Each rating made on the phone gets a random id
  (`clientId`, a UUID; older queued ratings get one when first read). `POST /v1/cards/reviews`
  takes up to `SYNC_MAX` (200) ratings and answers, per id, `applied`, `superseded` or `removed`
  with the server's card. The id is logged with the review (`card_review.client_id`, migration
  0170, unique per card), so a batch sent again after a lost answer stores nothing twice.
- **5.11** says, calmly (an info notice, not a red one), that the learner is offline and the
  answers are kept on the phone. Opened to answer out loud, it turns cards over instead and says
  why. The pending-sync notice with "Sync reviews" shows on 5.11 and now on 5.7 too.
- **Card sounds** are saved on the phone the first time they play (`card-<id>.mp3`, at most 300,
  the oldest first out) and play from there afterwards, online or not. Signing out deletes them
  with the rest of the account's offline data.

## Decisions (my call)

1. **The server's card wins.** A rating is stored only on the version of the card it was made on
   (`expectedReviews` equals the card's review count). One made on an older version (another
   device reviewed the card meanwhile) is dropped (`superseded`), and so are the phone's later
   ratings of that card, since they were built on it. Merging both histories would schedule the
   card from reviews in an order the learner never did; the other device's review is just as
   real, and losing one tap of Good costs less than a card at the wrong date.
2. **Applied in the order the learner reviewed**, by `reviewedAt`, across cards. Ratings of the
   same card are in order anyway (each expects the one before).
3. **A wrong phone clock is clamped, not refused.** A review time before the card's last review
   (or its creation) moves to that moment; one in the future moves to now. The single-card
   endpoint still refuses such times (`invalid_review`); the batch cannot ask the learner again.
4. **A week ahead.** Long enough for a trip or a week of bad reception, small enough to keep: 300
   cards are a few hundred kilobytes of JSON.
5. **Answering out loud needs a connection.** Spec §10.3 allows recording offline and judging
   later, but the answer's point is hearing at once how close it came and getting a suggested
   rating before tapping one. A judgment that arrives an hour later cannot suggest anything, so
   offline the card is turned over instead, and the screen says so.
6. **A card without its memory is left out offline**, rather than stopping the whole queue. Only a
   copy cached before memory was sent can be missing it; it comes back at the next connection.
7. **Batch, not one request per card.** A week offline can mean a hundred ratings; one request
   is faster on a weak connection and has one place to retry.

## Not done

- Review conversations and "Answer out loud" stay online (both need the server).
- The deck list on 5.7 shows its last copy when offline (as before); the counts do not include
  ratings still on the phone until they are synced.
- Ratings are synced when the review queue loads, when one is given, before signing out and
  with "Sync reviews"; there is no background sync while the app is closed.
