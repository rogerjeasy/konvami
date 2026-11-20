# A social concept for Konvami: research and proposal

Date: 2026-11-20. Status: proposal for the owner, not a settled decision (it is not one of D1–D19).
Screens are numbered 7.x, a new section after 6 · Profile.

**In one sentence:** two learners who each speak the other's native language get a two-part
mystery. Each one holds half of the clues and can only pass them on by speaking the language they
are learning to someone who hears it as their mother tongue. Each learner's own AI partner briefs
them, rehearses with them and corrects them in private. When no person is free, an AI plays the
other half and is labelled as one.

---

## 1. Research summary

### 1.1 How social features work in language apps today

| Product                   | Social mechanic                                                                                                                 | What works                                                                                                                                                                                                                                                                                                                                                                                                                                             | What fails                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Duolingo**              | Friend Quests (two friends share a weekly goal), Friend Streaks (up to five friends), Leagues (weekly leaderboards in 10 tiers) | It builds on friendships that already exist. Duolingo says 57% of users have at least one friend on the app, and it now matches learners with no friends into Friend Quests ([Friend Streak](https://blog.duolingo.com/friend-streak/), [Friends Quests](https://blog.duolingo.com/friends-quests/), [Leagues](https://blog.duolingo.com/duolingo-leagues-leaderboards/), [product lessons](https://blog.duolingo.com/product-lessons-friend-streak/)) | Nobody ever _talks_. The incentives reward time in the app, not progress, and critics call this out ([analysis](https://jtbdux-protocol.pages.dev/adoption-and-behavior/behavior-design-patterns/how-duolingo-engineered-50-million-daily-users-and-the-backlash-that-came-with-it)). Engagement figures such as "5.6× more likely" are not backed by a primary source                                                                                                                                                                                                                                                                                                                                                                                          |
| **HelloTalk, Tandem**     | Find a native speaker of your target language, chat, call                                                                       | They offer real native speakers for free                                                                                                                                                                                                                                                                                                                                                                                                               | Many users report dating misuse and sexual harassment, mostly aimed at women, even though both apps ban it ([HelloTalk on dating](https://www.hellotalk.com/en/blog/is-hellotalk-a-dating-app-language-exchange-boundaries), [The World of Chinese, 2018](https://theworldofchinese.com/2018/06/learning-difficulties), [Tandem guidelines](https://tandem.net/blog/safe-language-learning-apps)). Ghosting, conversations that dry up, one language taking over the exchange, and time-zone mismatch are also common ([LingoDeer review](https://blog.lingodeer.com/tandem-app-review/), [Tandem on dilemmas](https://www.tandem.net/language-exchange-dilemmas-solutions), [Tandem on levels](https://tandem.net/blog/different-language-proficiency-levels)) |
| **Speaky**                | An open chat directory                                                                                                          | It is easy to get in                                                                                                                                                                                                                                                                                                                                                                                                                                   | It drifts into socialising without learning ([Mezzoguild review](https://www.mezzoguild.com/speaky-review/))                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **Busuu**                 | Native speakers correct your written or spoken answers                                                                          | Learners in an Open University study (4,095 learners) rated it highly and found it eased anxiety ([Busuu blog on the study](https://blog.busuu.com/open-university-research-study/), [how-to](https://www.busuu.com/en/how-to/help-others))                                                                                                                                                                                                            | The corrections come from unpaid volunteers and vary in quality. Some learners find feedback from strangers scary, and getting no feedback at all demotivates them ([FOE14 slides](https://conference.pixel-online.net/FOE/files/foe/ed0014/PPT/8835-ELRN6471-PPT-FOE14.pdf))                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **italki**                | Paid tutors, plus community content                                                                                             | People pay for it and it is reliable                                                                                                                                                                                                                                                                                                                                                                                                                   | It is not peer-to-peer, and some learners say they prefer it _because_ free exchanges felt like dating apps ([r/languagelearning thread](https://redlib.hbubli.cc/r/languagelearning/comments/1kn8qun/anyone_actually_making_free_language_exchanges/msgq8wi/?context=3))                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Clubhouse-style rooms** | Live audio rooms                                                                                                                | Hype at launch                                                                                                                                                                                                                                                                                                                                                                                                                                         | Everything is live with no replays, rooms are hard to find, and trolling followed. One cohort analysis shows month-2 retention at 10–20% and close to zero by month 6, and downloads fell about 95% in a year ([ProdLab](https://prodlab.substack.com/p/from-hype-to-hibernate-the-clubhouse), [Appfigures](https://appfigures.com/resources/insights/20220701/amp?f=4), [DAME on moderation](https://damemagazine.com/2022/08/08/clubhouse-a-study-in-failed-content-moderation))                                                                                                                                                                                                                                                                              |
| **Airchat**               | Asynchronous voice posts, transcribed, autoplay                                                                                 | Asynchronous voice removes the live pressure ([TechCrunch](https://techcrunch.com/2024/04/13/airchat-launch/), [overhaul](https://sg.news.yahoo.com/talky-social-app-airchat-gets-190316975.html))                                                                                                                                                                                                                                                     | It is a public feed with open questions about moderation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Discord study servers** | Topic channels, voice rooms, events                                                                                             | Volunteers organise them                                                                                                                                                                                                                                                                                                                                                                                                                               | They are open spaces with uneven moderation and no structure for practice (general knowledge; not researched further)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

**The patterns behind the failures:**

1. **Cold start.** A tandem only works if a matching native speaker is free at the same moment.
2. **Awkwardness.** "What do we talk about?" Free conversation with a stranger is the most
   anxious form of speaking there is.
3. **Open DMs plus profiles plus photos** turn into a dating app, whatever the guidelines say.
4. **Uneven levels and imbalance.** One language takes over the exchange, and the weaker speaker
   stops speaking.
5. **Low-effort content** fills open feeds and rooms.
6. **Live-only formats** collide with time zones and busy lives (Clubhouse).

### 1.2 Mechanics from outside language learning

- **Death Stranding's Social Strand System.** Players never meet and there is no chat. They help
  each other through structures, signs and returned cargo, and kindness pays both sides with
  "Likes". Kojima says he is most proud of its positive shared world ([Shacknews](https://shacknews.com/article/125784/a-big-goal-of-death-stranding-directors-cut-was-improving-the-asynchronous-multiplayer),
  [GamesRadar](https://gamesradar.com/kojima-is-most-proud-of-death-strandings-positive-shared-world-multiplayer-approach),
  [PC Gamer](https://pcgamer.com/quiet-co-operation-with-other-players-makes-death-stranding-special)).
  _Lesson: give the other person a reason to help you, inside a structure._
- **Journey.** No names, no chat, just a chirp. Once the distractions were gone, "the other
  player becomes the focus", and abuse became close to impossible ([Game Developer](https://www.gamedeveloper.com/design/cutting-corners-networking-design-in-journey),
  [MCV on Jenova Chen](https://mcvuk.com/development-news/jenova-chen-reveals-secrets-of-journey-design/)).
  _Lesson: limiting how people can communicate creates closeness and safety at once._
- **Dark Souls messages.** Players build messages from fixed templates, and a good message earns
  a reward. The templates cut toxicity but did not end it; innuendo got through, and downvotes
  were added later ([GamesBeat](https://gamesbeat.com/how-did-dark-souls-iis-in-game-message-system-affect-player-behavior),
  [Kotaku](https://kotaku.com/souls-games-are-great-except-for-the-sexist-messages-f-1828561485)).
  _Lesson: use templates for reactions, and still moderate._
- **Slowly.** Letters take hours or days to arrive, depending on distance. Users have avatars
  instead of photos and collect stamps ([help centre](https://help.slowly.app/hc/en-us/articles/115001740772-What-is-Slowly)).
  _Lesson: a delay can be a feature, and for Konvami it also leaves time for moderation._
- **Postcrossing.** You send a card to a random member and receive one from another. You receive
  only if you sent, and your address goes only to the few people who write to you. It has more
  than 800,000 members in 208 countries ([how it works](https://www.postcrossing.com/help/how-does-postcrossing-work),
  [Wikipedia](https://www.wikipedia.org/wiki/Postcrossing)). _Lesson: reciprocity rules plus
  minimal personal data can scale among strangers._
- **Wordle.** The share grid shows how you did without spoiling the answer, and every share works
  as an advert ([why it blew up](https://dinogame.gg/blog/why-wordle-blew-up/)). _Lesson: a
  shared daily or weekly puzzle plus a spoiler-free card brings friends in without dark patterns._
- **BeReal.** A two-minute window at a random time grew fast and then felt like a chore. Daily
  users fell about 61% from their peak in five months ([Platformer](https://platformer.news/how-bereal-missed-its-moment),
  [Dazed](https://www.dazeddigital.com/life-culture/article/61166/1/why-did-bereal-fail-social-media-instagram-authenticity)).
  _Lesson: no compulsory time windows._
- **Strava.** Kudos go with running more, and peer influence matters even more ([Running Magazine on the Radboud study](https://runningmagazine.ca/?p=91520),
  [Vox](https://www.voxweb.nl/en/what-kudos-can-do-for-your-motivation-and-sports-pleasure)).
  Segments compare you with people you will never meet. _Lesson: one-tap appreciation of a
  specific effort works._
- **Jackbox and Quiplash.** Each player has a private phone screen, the prompts are fixed and an
  audience can join, so the friction is low. But getting no votes stings ([Built In](https://builtin.com/articles/jackbox-games-design-party-pack),
  [critical play](https://mechanicsofmagic.com/2024/04/24/critical-play-quiplash-other-jackbox-games-ellie/)).
  _Lesson: prompts and private roles remove the blank page, and there should be no public
  voting on a learner's speech._
- **Exquisite corpse (cadavre exquis, Paris 1925).** Each person adds to a hidden, folded sheet,
  and the result is revealed at the end ([Poets.org](https://poets.org/glossary/exquisite-corpse),
  [Kolaj](https://kolajmagazine.com/content/content/articles/exquisite-corpse-introduction)).
  _Lesson: a partly hidden contribution plus a joint reveal is a joyful format._
- **Murder-mystery parties and escape rooms.** Each guest gets a role card with secret
  information, and the game cannot be solved alone (general knowledge). _Lesson: an assigned
  role is a social shield, because you speak "in character", not as yourself._
- **Radio call-in shows.** A host frames the topic, screens the callers and makes every caller
  sound good (general knowledge). _Lesson: an AI can play the host and the screener._
- **Among Us and Twitch Plays** show that hidden roles and collective input work, but live
  real-time chat is where they turn toxic (general knowledge).
- **Geocaching** leaves something behind for a stranger to find, and **Bumble BFF** shows that
  friendship matching drifts towards dating unless the structure prevents it (general knowledge;
  not researched further).

### 1.3 What research says about anxiety and peer practice

- **Foreign language anxiety** is its own construct, made of communication apprehension, test
  anxiety and fear of negative evaluation, and speaking triggers it most (Horwitz, Horwitz & Cope
  1986, _The Modern Language Journal_ 70(2):125–132, FLCAS 33 items, [PDF](https://www.ling.ohio-state.edu/research/groups/lacqueys/readings/horowitz.pdf)).
  _Design consequence:_ never evaluate a learner's speech in front of another learner, let them
  rehearse before speaking, and let them speak in character.
- **Interaction helps learning.** A review of input, negotiation for meaning and output finds
  interaction effective, with peer interaction as an important variable ([Loewen & Sato 2018,
  _Language Teaching_](https://www.cambridge.org/core/product/78A156EE200F744F5978F99BFB073DBE)).
- **Two-way information-gap tasks**, where each partner holds information the other needs,
  produce more negotiation of meaning than free conversation (Nakahama, Tyler & van Lier 2001),
  and split-information tasks produce more than shared-information tasks. Negotiating word
  meanings leads to measurable vocabulary learning (Newton; [Victoria University repository](https://ir.wgtn.ac.nz/handle/123456789/27079)).
  _Design consequence:_ the social format should be a **split-information task**, not open chat.

### 1.4 Rules and policies that shape the design

- **Apple App Store Review Guideline 1.2 (user-generated content)** requires a filter for
  objectionable material, a way to report content with timely responses, blocking, and
  published contact information ([Apple guidelines](https://developer.apple.com/app-store/review/guidelines/#user-generated-content),
  not re-checked in this research). Konvami has **no support address yet** (see the 6.20 row in
  `docs/design/README.md`), so one is needed before launch.
- **GDPR Article 8.** The default age for consent to online services is 16, and member states may
  lower it to 13 ([gdpr-info.eu](https://gdpr-info.eu/art-8-gdpr/)). Germany and France's own
  ages and the revFADP's rules for minors **were not confirmed** in this research and need the
  lawyer.
- **The EU Digital Services Act** applies to hosting user content: notice and action, and a
  statement of reasons when content is removed. Small companies are exempt from some
  online-platform duties, but this is to be confirmed by the lawyer (background knowledge, not
  checked here).

---

## 2. Three new concepts

### Concept A: Two Halves (Zwei Hälften · Deux moitiés · Due metà), the flagship

A two-person, asynchronous voice mystery, split by language. Each learner holds half of the
clues and passes them on by speaking **the language they are learning to someone for whom it is
their native language**. Everyone speaks the hard language and hears the easy one, so the message
always gets through: the listener is a native speaker who wants the clue to solve the case. Each
learner's own AI partner briefs them, rehearses with them and corrects them in private. The other
person only ever hears the attempt, never a judgement of it.

_Why it is new:_ tandem apps have mirror pairs but no task, no scaffolding and open DMs. Escape
rooms have the task but no language mirror. Nobody combines a language mirror, a split-information
case, asynchronous voice and a private AI coach for each player.

### Concept B: Radio Konvami (a call-in show)

Every day an AI host (a Konvami persona) presents a 6-minute show in each language learned, on
one prompt ("Your most embarrassing train story"). Learners phone in asynchronously with a voice
note of up to 45 seconds. The AI screens each call, picks a few and weaves them into the episode
with host banter, so each caller sounds good. Listeners react with fixed applause cards. With
few users, AI callers (labelled) fill the show.

_Why not the flagship:_ it broadcasts a learner's voice to many people. That means the most
moderation risk, the weakest one-to-one bond, and fear of negative evaluation in public. It is
kept for phase 3 as an opt-in showcase built from Two Halves material.

### Concept C: Kettengeschichte (exquisite voice)

Four learners of the same language build an audio story, each hearing only the line before
theirs. An AI narrator keeps the plot together and fills seats that are empty. At the end the
story is revealed as a radio play mixing their voices, plus a narrator who smooths over the
mistakes.

_Why not the flagship:_ there is no cross-language pairing, everyone speaks a language they are
still learning to other non-natives, so mistakes add up and comprehension fails, and it needs
four people. It is kept as a "season finale" format for Duos (§3.3) in phase 3.

---

## 3. The flagship: Two Halves

### 3.1 The core idea in pictures

```
  Camille (Lyon)                                        Jonas (Zurich)
  French native, learns German B1                       German native, learns French A2
  ─────────────────────────────                         ──────────────────────────────
  holds half A of the clues                             holds half B of the clues
        │                                                      │
  Briefing + rehearsal with                              Briefing + rehearsal with
  HER partner (in German)                                HIS partner (in French)
        │                                                      │
        ▼  speaks GERMAN (her hard language)                   ▼  speaks FRENCH (his hard language)
     ┌──────── move ────────┐                           ┌──────── move ────────┐
     │ checked, then sent   │ ───────────────────────▶  │ Jonas hears German:  │
     │                      │                           │ easy, his own tongue │
     │ Camille hears French │  ◀───────────────────────  │ checked, then sent   │
     │ easy, her own tongue │                           └──────────────────────┘
     └──────────────────────┘
        │                                                      │
  Private corrections from HER                          Private corrections from HIS
  partner; the other never sees them                    partner; the other never sees them
```

### 3.2 The core loop, step by step

1. **Join.** Five questions and nothing else typed: native language (one of the four), the
   language learned (already in the profile), a consent to share one's voice with one other
   learner (separate from AI consent), a generated codename (for example "Linde-7"; no free-text
   name), and where they are, as a city chosen from a list, a country only, or nothing.
2. **Match.** The server looks for a **mirror** (a native of my language who learns my native
   language), in the same age band, never someone blocked, and preferably not a recent partner.
   If none is found within 12 hours, the learner can keep waiting or play straight away with an
   **AI stand-in**, shown as "Julien · AI" with the AI chip everywhere. With fewer users, two
   learners of the same language (a German learner in Lyon with one in Milan) can play in
   **same-language mode**: both speak German, and the Bridge agent helps comprehension.
3. **Case.** Both seats get one case from the library (for example _The Lost Cello_), with a
   board: map, timeline, suspects. Each seat sees only its half of the clues, and each case has
   3 rounds of moves per seat.
4. **Briefing (private, about 2 minutes, optional).** The learner's own partner (for example
   Lena) tells them their clue in their target language, adapted to their level. It is built to
   draw out a structure the learner is weak in, taken from the Session Planner's confirmed
   mistakes (spec §7 #2, "targeted elicitation"). They rehearse once or twice, and the
   **Live Error Spotter** helps exactly as in a call (5.3).
5. **Move.** The learner records a voice note of up to 90 seconds in their target language, can
   listen to it, and sends it. A **Veil** switch (on by default for a learner's first two cases)
   sends their exact words, transcribed verbatim, read out by a neutral voice instead of their
   own. That is less exposure and less voice data shared, and it can be switched off at any time.
6. **Check (seconds to minutes, never seen by the other).** Verbatim transcription, then local
   rules (links, contact details, instructions aimed at the model), then the moderation provider,
   then an on-task check (is this about the case, or is it flirting, a meet-up, a request for a
   handle or contact?). The move is either **delivered** or **held** for review. If it is held,
   the sender gets a calm note saying why, and the other learner sees nothing.
7. **Receive.** The other person plays the move. For them it is their native language, so they
   almost always understand. They react with **one of four templates**: _Got it_ · _Say that
   again, slower_ · _Thanks, that helped_ · _Bravo for that sentence_ (shown in their interface
   language). They then **act on the clue** on the board, for example by placing the cello at a
   station. Acting on it correctly is the proof that the message got through.
8. **Native nudge (optional, supporting mechanic 1).** The listener may suggest _one_ more natural
   way to say one phrase they heard, by voice or typed. It goes to the **sender's AI partner**,
   not to the sender directly. The partner checks it and passes it on only if it is right
   ("Jonas suggested _am Bahnhof_ instead of _im Bahnhof_. He's right, here's why."). A nudge
   that fails the check is dropped without a word.
9. **Private report.** After each move, the sender gets 1–3 corrections that the second check
   confirmed, plus "Say it better" and cards (5.10 components). Their mistakes are never shown to
   the other learner.
10. **Solve.** After the last round, each seat submits its answer separately. The case is solved
    when both agree and are right. A **recap scene** follows: both AI partners, Lena and Julien,
    act out the ending as a short radio drama, using the two-partner speech already built for
    5.24.
11. **Again?** Each learner privately chooses whether to play with this person again. Only if
    both say yes does the pair become a **Duo** (supporting mechanic 3), the only way to "know"
    someone. A Duo can start new cases straight away. There are still no free DMs.
12. **Share.** A spoiler-free card (supporting mechanic 2): "Two Halves · _The Lost Cello_ ·
    solved in 6 moves · DE ⇄ FR · Lyon ⇄ Zürich". It carries an **invite code** for friends.
    A friend who joins with the code is matched with the inviter first.

**Timeouts, without shame.** A seat has 72 hours per move. After that, the waiting learner may let
an AI play that seat ("Jonas is busy. Julien (AI) is playing his half from now on."). The case
continues and nobody is blamed. A learner can pause Two Halves at any time.

### 3.3 Supporting mechanics (three)

1. **Native nudges** (step 8). Natives help as Busuu's community does, but every nudge is checked
   by AI before anyone sees it, so the quality worry (§1.1) goes away. Helping costs one tap and
   ten seconds.
2. **The weekly case and the share card.** Every Monday, one _season case_ is the same for every
   pair in each language pair, as with Wordle, so friends can compare without spoiling. Friends
   who play it bring in their friends through the invite code. There is no leaderboard and no
   streak for social play.
3. **Duos and the strand map.** Mutual opt-in after a case (step 11). A small map shows the lines
   drawn between your city and the cities of the people you played with, as in Death Stranding.
   It shows only what each person chose to share, and nothing finer than a city.

### 3.4 Sample session script

_The Lost Cello_ (Das verlorene Cello / Le violoncelle perdu). Camille is 24, in Lyon, French
native, learning German at B1. Jonas is 31, in Zurich, German native, learning French at A2. Her
partner is Lena (Berlin). His partner is Margaux (Bordeaux).

> **Monday 19:10, Camille, briefing (in German, about 90 seconds)**
> **Lena:** "Our case! A cellist, Inès, has lost her cello on the way from Lyon to Zurich. You
> have the station staff's statements. Here's the first one: at 14:20 a conductor saw a big black
> case _on the platform_. Your partner has the map, and he doesn't know about the conductor. Try
> telling him. Start with _Ein Schaffner hat…_"
> **Camille:** "Ein Schaffner hat um 14 Uhr 20 einen Koffer… auf den Bahnsteig gesehen."
> **Lena:** "Good, he'll understand you! One small thing: _auf dem Bahnsteig_, because you're
> saying where it was. Do you want to try again?"
> **Camille:** "…auf dem Bahnsteig gesehen. Er war schwarz und sehr groß."
>
> **19:14, move recorded** (40 seconds, Veil on, her first case). Checked, delivered at 19:15.
>
> **Monday 21:30, Jonas** plays it: a Lyon learner telling him, in German he understands at once,
> about a conductor and a platform. He taps _Got it_ and _Bravo for that sentence_, then drags
> the cello to "Platform 4, Lyon Part-Dieu, 14:20". He adds a nudge by voice:
> _"Man sagt eher 'ein grosses schwarzes Etui'"_ ("you'd rather say a big black case"). Margaux
> does not see it; it goes to Lena, who checks it.
>
> **Tuesday 07:50, Jonas, briefing (in French)**
> **Margaux:** "You have the map. Inès changed trains at Geneva, but the cello isn't on the second
> train. Tell Camille, in the _passé composé_: _Elle a changé…_"
> **Jonas:** "Elle a changé de train à Genève. Le violoncelle… n'est pas… dans le deuxième train."
> **Margaux:** "Parfait. Do you want to add the time? _Elle est arrivée à 16 heures_, with
> _être_, remember."
>
> **Tuesday 12:30, Camille** hears Jonas in French, her own language: clear. Lena adds: "By the
> way, Jonas suggested _Etui_ for a cello case. He's right: _Koffer_ is a suitcase, _Etui_ is for
> instruments." Camille saves _das Etui_ as a card.
>
> **Rounds 2 and 3** follow over three days. **Thursday:** both submit "left on platform 4 at Lyon
> Part-Dieu, now at lost property". Solved. Lena and Julien's 50-second recap drama plays. Both
> tap "Play again with Linde-7?" and they become a Duo.

### 3.5 Screens (section 7 · Two Halves)

Two Halves belongs to the **talking** family, so its heroes are **tomato** (`PageHero`). Briefings
are calls, so they use the **forest block with lime** (`BlockScope`). The learner's own moves
are **lime bubbles**, and lines in the language learned are in the serif italic (`langLine`). The
other learner's moves are paper bubbles with an ink outline. An AI stand-in always carries the
"AI" chip. Mistakes use the amber "Let's polish this" chip only, in the private report.

| #     | Screen              | What it shows                                                                                                                                                                                                                                                                       |
| ----- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 7.1   | Two Halves          | A tomato `PageHero` ("Solve a case with someone who speaks the language you're learning"), the current case with whose turn it is, "Start a case", this week's case, Duos, the strand map. Reached from a row on Talk (5.2) and a card on Today (5.1) when it is the learner's move |
| 7.2   | Join                | Native language, voice-sharing consent (its own record, version 1), codename (generated, can be re-rolled), place (a list of cities, a country only, or none), Veil default. Learners aged 16–17 see their band explained                                                           |
| 7.3   | Finding a partner   | What the match is waiting for, "Play now with an AI" (`OptionCard`), "Keep looking" (default 12 hours), and a reminder offer                                                                                                                                                        |
| 7.4   | Case board          | Your half of the clues, the board (map, timeline, suspects as `OptionCard`s), the list of moves, a countdown of the 72 hours with no pressure wording, and "Hand this seat to an AI"                                                                                                |
| 7.5   | Briefing            | The call screen (5.3) with the case card on top. Its live tools give the clue and offer a retry. It is optional; "Skip to recording" is always there                                                                                                                                |
| 7.6   | Record a move       | Hold or tap to record (90 seconds at most), listen back, re-record, Veil switch, Send. A pinned primary action                                                                                                                                                                      |
| 7.7   | Incoming move       | Play (slow playback through the device's playback rate), optional captions, the four reaction templates, act on the clue, "Suggest a better way" (nudge), and report (flag sheet)                                                                                                   |
| 7.8   | Case solved         | `Pop` on solving, the recap drama, "Play again with them?" (private, mutual), the share card                                                                                                                                                                                        |
| 7.9   | Move report         | The private report for one move: confirmed corrections, "Say it better", cards, nudges that passed the check (reuses the 5.10 parts)                                                                                                                                                |
| 7.10  | Report or block     | The flag sheet (`components/flag-sheet.tsx`) with social reasons: harassment, sexual content, personal details, hate, off-topic, other. Blocking ends the case (an AI finishes it) and the two are never matched again                                                              |
| 7.11  | Two Halves settings | Pause, Veil default, my place, voice-sharing consent (withdrawing it removes all my moves), Duos (remove one), blocked people, "Delete my Two Halves data"                                                                                                                          |
| 7.12  | Invite a friend     | A code and a link to share. The friend needs their own account and the same age band                                                                                                                                                                                                |
| 6.15+ | Owner: held moves   | The existing owner queue (6.15) gets a "Two Halves" filter: held moves with transcript and audio, reports, and actions (deliver, remove, warn, suspend). It shows codenames only                                                                                                    |

### 3.6 Server pieces

All of it lives in `services/api`, with no new heavyweight infrastructure.

- **Domain modules:** `domain/halves.py` (cases, seats, moves, the state machine),
  `domain/halves_match.py` (pure matching rules), `domain/halves_cases.py` (case templates),
  `domain/halves_check.py` (the move check), and `domain/halves_nudges.py`. The API handlers sit
  in `api/halves.py`. Providers stay behind their current interfaces: the verbatim pass
  (`domain/recordings.py`, `speech.py`), `Moderator` (`domain/moderation.py`), the small text
  model, and second-voice speech for the Veil and recaps (`candidate_speech.SecondVoice`,
  `two_partners.py`).
- **The worker** (`worker.py`) gets a `check_move` job (transcribe, check, deliver, push) and a
  `move_report` job (the same pipeline as reports, for one turn).
- **The hourly schedule** that already runs pen-pal notes gets `halves_tick`, which handles
  matching, offers of an AI after 12 hours, AI seats after 72 hours, and delete-after timers. It
  uses the same EventBridge rule, so no new resource is needed.
- **Storage:** the existing media bucket under `halves/` with a **30-day lifecycle rule** (one
  small Terraform change in `infra/modules/media`, planned and shown to the owner first). Audio is
  played back through presigned URLs that expire after 5 minutes. Recipients cannot download it.
- **Push:** the existing Expo push service sends "Your move arrived", within the reminder quiet
  hours.
- **Costs** (`domain/costs.py`): new features `halves_move` (transcription plus small-model
  checks, a few cents) and `halves_briefing` (realtime minutes, which count towards the weekly
  voice minutes). An AI stand-in's move is one small-model reply plus text-to-speech.

### 3.7 Data model (migration `0220_two_halves.sql`)

| Table                  | Main columns                                                                                                                                                                                                                                            | Notes                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `halves_profile`       | `account_id` PK, `codename`, `native_language`, `place_city_id` null, `place_country` null, `age_band` (`minor` 16–17 or `adult`, worked out from the 2.1 birthday, never typed), `veil_default`, `paused`, `voice_consent_version`, `voice_consent_at` | No free text at all                                                    |
| `halves_case_template` | `id`, `language_pair` or `same`, `min_level`, `max_level`, `clue_graph` (JSON: facts that do not depend on a language, the clues of each half, the solution), `season_week` null                                                                        | Hand-structured. The AI writes the wording for each level and language |
| `halves_case`          | `id`, `template_id`, `status` (open, solved, abandoned), `created_at`, `ended_at`, `delete_after`                                                                                                                                                       |                                                                        |
| `halves_seat`          | `case_id`, `seat` (A or B), `account_id` null, `stand_in_persona` null, `speaks`, `hears`, `answer`, `left_at`                                                                                                                                          | `account_id` null means an AI stand-in                                 |
| `halves_move`          | `id`, `case_id`, `seat`, `round`, `audio_key`, `veiled`, `transcript_verbatim`, `status` (checking, delivered, held, removed), `check_reasons[]`, `delivered_at`                                                                                        | The audio and transcript are deleted at `delete_after`                 |
| `halves_reaction`      | `move_id`, `template` (enum of four), `clue_action` (JSON), `correct`                                                                                                                                                                                   |                                                                        |
| `halves_nudge`         | `id`, `move_id`, `text`, `verdict` (passed, dropped), `delivered_at`                                                                                                                                                                                    | Only passed nudges reach the sender                                    |
| `halves_match_ticket`  | `account_id`, `wants` (mirror or same), `created_at`, `ai_offered_at`                                                                                                                                                                                   |                                                                        |
| `halves_duo`           | `account_a`, `account_b`, `created_at`                                                                                                                                                                                                                  | Made only from two "yes" answers                                       |
| `halves_block`         | `blocker`, `blocked`, `created_at`                                                                                                                                                                                                                      | Applies both ways in matching                                          |
| `flags` (existing)     | new kind `halves_move`, new reasons                                                                                                                                                                                                                     | Copies the transcript, as today                                        |
| `halves_strike`        | `account_id`, `reason`, `move_id`, `at`                                                                                                                                                                                                                 | Three confirmed strikes suspend social play                            |

### 3.8 AI agents

| Agent                                   | Model                                                                              | Job                                                                                                                                                                                                    |
| --------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Case Writer**                         | Strong text model, cached once for each template, level and language               | Turns a template's clues into wording at CEFR A1–C1 in each language, written to draw out the structure planned for the learner (the Session Planner picks the variant)                                |
| **Briefer** (the learner's own partner) | Realtime, as a practice call                                                       | Briefs, rehearses and corrects in a friendly way through the existing practice instructions plus a case block. Translates only as a last resort, and only into the explanation language                |
| **Move Checker**                        | Verbatim pass + local rules + moderation provider + small-model on-task classifier | Deliver or hold. The classifier labels: `on_task`, `romance`, `contact_or_meetup`, `personal_probe` (age, school, address), `harassment`, `self_harm` (which sends the learner the care path of §16.3) |
| **Bridge**                              | Small text model                                                                   | Same-language mode only: offers a slower replay, then a simpler paraphrase, then the gist in the explanation language, in that order. In mirror mode it is not needed                                  |
| **Nudge Verifier**                      | Strong text model, as the second check of reports                                  | Is the suggested phrase right and more natural for this context? If not, the nudge is dropped quietly                                                                                                  |
| **Private Coach**                       | The existing report pipeline for a single move                                     | 1–3 confirmed corrections, "Say it better", cards                                                                                                                                                      |
| **AI Stand-in**                         | Small text model + text-to-speech, labelled                                        | Plays a seat: answers moves, acts on clues, makes the occasional plausible mistake of its own so the game stays fair (it never "solves" alone). Never presented as a human                             |
| **Recap Director**                      | Small text model + two-partner speech                                              | Writes the 40–60 second ending scene for both partners                                                                                                                                                 |

### 3.9 Safety and moderation by design

**Structure first, filters second:**

- **No DMs, no profiles, no photos, no free-text names.** The only channel is a move inside a
  case, about the case. Reactions are templates. Nudges go through AI.
- **Age bands.** Learners aged 16–17 are matched only with learners aged 16–17. Adults are never
  matched with minors, even as Duos or through invites (an invite across bands is refused
  calmly). For the minor band, Veil is **always on** in phase 2, and the band opens only in
  phase 3, after the lawyer's review.
- **Place:** a city from a fixed list, a country, or nothing, as the learner chooses. Never GPS,
  never a district.
- **A delay by design.** Moves are delivered after the check (usually under a minute), and a held
  move is never delivered without a human decision. As in Slowly, the delay is part of the game,
  so moderation costs the experience nothing.

**The moderation flow for a move:**

```
record → upload (presigned PUT) → check_move job:
  1. verbatim transcript (the existing pass; gives the report the true mistakes)
  2. local rules (moderation.py): links, email, phone, handles ("insta", "snap", "@"), instructions to the model → HOLD
  3. moderation provider on the transcript → HOLD if flagged
  4. on-task classifier → HOLD if romance / contact_or_meetup / personal_probe / harassment
     (for the minor band the thresholds are stricter, and any personal_probe holds the move)
  5. fails closed: provider unavailable → the move waits and is retried, never sent unchecked
  → DELIVER (push to recipient) or HELD (sender: calm note; owner queue)
```

- **Reports and blocks** are on every incoming move (7.7) and are made in one tap. A report hides
  the move for the reporter at once. A block ends the case (an AI finishes the other seat) and
  prevents future matches.
- **Strikes:** a held move confirmed by the owner, or a report the owner confirms, is one strike.
  Three strikes suspend Two Halves. A confirmed sexual or grooming attempt involving a minor means
  removal and an account review.
- **What is not checked:** the audio itself (tone, sounds) in phase 1–2, since only the transcript
  is moderated. Veil removes this gap for those who use it. This is to be revisited (an audio
  classifier) before the minor band opens.
- **Voice consent** is a record of its own (`halves_voice` v1), separate from AI consent (2.5).
  It says that one other learner hears the moves, that there is no download, that moves are
  deleted 30 days after the case ends, and that screen recording cannot be prevented. Withdrawing
  it deletes all of one's moves, and their cases show "Message removed".
- **Data minimisation and deletion:** codename, native language, optional city or country, age
  band. Deleting the account (6.9) or "Delete my Two Halves data" (7.11) removes everything. The
  data export (6.19) adds the learner's own moves, reactions and nudges, never the other
  person's.

### 3.10 Cold-start plan

1. **Fun with one other person.** The format _is_ two people.
2. **Fun with nobody.** An AI stand-in is offered after 12 hours (or at once, on request), always
   labelled. A full case against an AI is still good practice and still yields a report.
3. **Seed mirror pairs where they naturally occur:** Switzerland is bilingual (German and French
   speakers learning each other's language), and the existing testers can bring friends. University
   tandem programmes in Zurich, Lausanne, Geneva, Lyon and Strasbourg, and Franco-German exchange
   networks, can be approached by the owner.
4. **Same-language mode** lets two learners of German play when no mirror is free. It ranks lower
   than a mirror and is labelled.
5. **Invite codes** match the friend with the inviter first. This is the most reliable match there
   is, and the safest (they already know each other).
6. **Asynchronous by default,** so time zones do not matter. A move can be answered in minutes or
   days.

### 3.11 Metrics

- **Activation:** % of learners who open 7.1 and send a first move; time to first match (human vs AI).
- **Core:** cases completed per week; % solved; moves per active learner; speaking minutes in Two Halves.
- **Native intelligibility (new):** % of moves acted on correctly at the first play, a
  communication-based measure of speaking that no other app has. Shown to the learner privately
  ("Jonas understood 5 of your 6 clues the first time").
- **Bond:** % of human cases that become a Duo; cases per Duo.
- **Growth:** invites sent, accepted, and invited friends who complete a case.
- **Retention:** D7 and D30 of learners who played vs a comparable group who did not.
- **Anxiety (opt-in):** a three-item pulse taken from the FLCAS fear-of-evaluation items, before
  the first case and after the fifth.
- **Safety:** held moves per 1,000; reports per 1,000; owner time to decision (target under 24 h);
  strikes; blocks per 1,000 cases.
- **Guardrails, not goals:** no streaks, no leaderboards, no "your partner is waiting" guilt.
  Reminders follow the 6.13 rules (at most one a day).

### 3.12 What needs the owner

- **Legal review** before strangers hear each other: user-to-user voice under GDPR and the revFADP
  (voice as personal data, the legal basis, the 30-day retention), the DSA duties for hosting
  user content (notice and action, statement of reasons), youth protection for learners aged
  16–17 in Germany, France and Switzerland, an update to the Terms and Privacy policy (6.18), and
  the age of digital consent in each country.
- **A support address** (`EXPO_PUBLIC_SUPPORT_EMAIL`), required by Apple 1.2 for apps with user
  content.
- **Moderation staffing:** someone who decides on held moves and reports within 24 hours, every
  day. In phase 2 that is the owner (a few minutes a day for a tester group). Before opening the
  minor band, a trained second moderator and a written escalation path (including to the police
  for grooming).
- **Case writing:** approve the first 6 case templates (§4); the AI writes the wording.
- **Seeding partnerships** with tandem programmes.
- **Store review notes** that explain the UGC safeguards.

---

## 4. Phased build plan

### Phase 1: buildable now (a few days for a small team), with no stranger-to-stranger voice

The aim is to prove that the loop is fun and good practice, without the legal and moderation
exposure.

- **Who plays:** every learner can play **against an AI stand-in**. Adults can play **with a friend
  they invite** (7.12), since they already know each other. Only owners and testers are enabled
  (a `halves.enabled` setting).
- **Screens:** 7.1, 7.2 (consent v1, codename, country or city, native language), 7.4, 7.5 (the
  briefing as an optional realtime call; skippable), 7.6 (Veil on by default and changeable),
  7.7, 7.8 (solve plus recap drama, no Duo yet), 7.9, 7.10, 7.11, 7.12.
- **Server:** migration `0220_two_halves.sql`; `halves.py` state machine; matching only by invite
  code or AI; `check_move` with all four check steps (it runs for friends too); the private
  report; AI stand-in; recap; the hourly tick for timeouts; the 30-day lifecycle rule; flags of
  kind `halves_move` in the 6.15 queue.
- **Content:** **6 case templates** (_The Lost Cello_, _Grandma's Recipe_, _The Missed
  Connection_, _The Flatshare Key_, _The Museum Postcard_, _The Wrong Parcel_), for the pairs
  DE⇄FR, DE⇄IT, DE⇄EN and FR⇄EN, plus same-language mode.
- **Tests:** unit tests for the matching rules, the state machine, the check outcomes (fixtures
  for each classifier label, and failing closed); behaviour tests for 7.6 and 7.7; the i18n key
  test in all four languages; the visual check at the five sizes in light and dark (AGENTS.md
  2.6).
- **Left out:** stranger matching, Duos, nudges, the weekly case, the strand map, the minor band.

### Phase 2: strangers, adults, after the legal review and with the owner moderating

- Mirror matching of strangers in the adult band, with the 12-hour AI offer and same-language
  mode.
- **Native nudges** with the Nudge Verifier.
- **Duos** (mutual opt-in) and the strand map.
- **The weekly season case** and the share card with an invite code.
- Strikes and suspension; owner tools for held moves; reports per 1,000 on the 6.12 or 6.15 owner
  page.
- Veil stays the default for the first two cases.

### Phase 3: wider and bolder

- The 16–17 band (Veil always on, stricter thresholds, a second moderator, an audio classifier).
- **Radio Konvami** (Concept B) as an opt-in showcase that Duos can phone into.
- **Kettengeschichte** (Concept C) as a four-seat season finale for two Duos.
- Cases suggested by the Learning Director in the week's plan (one a week at most), and cases
  built from the learner's course import (5.23).

---

## 5. Sources

Primary or product sources: [Duolingo Friend Streak](https://blog.duolingo.com/friend-streak/) ·
[Duolingo Friends Quests](https://blog.duolingo.com/friends-quests/) ·
[Duolingo Leagues](https://blog.duolingo.com/duolingo-leagues-leaderboards/) ·
[Duolingo product lessons](https://blog.duolingo.com/product-lessons-friend-streak/) ·
[HelloTalk: not a dating app](https://www.hellotalk.com/en/blog/is-hellotalk-a-dating-app-language-exchange-boundaries) ·
[Tandem on safety](https://tandem.net/blog/safe-language-learning-apps) ·
[Tandem dilemmas](https://www.tandem.net/language-exchange-dilemmas-solutions) ·
[Tandem on levels](https://tandem.net/blog/different-language-proficiency-levels) ·
[Busuu and the Open University](https://blog.busuu.com/open-university-research-study/) ·
[Busuu: help others](https://www.busuu.com/en/how-to/help-others) ·
[Slowly help centre](https://help.slowly.app/hc/en-us/articles/115001740772-What-is-Slowly) ·
[Postcrossing](https://www.postcrossing.com/help/how-does-postcrossing-work) ·
[GDPR Art. 8](https://gdpr-info.eu/art-8-gdpr/) ·
[Apple App Review Guidelines 1.2](https://developer.apple.com/app-store/review/guidelines/#user-generated-content)

Research: [Horwitz, Horwitz & Cope 1986](https://www.ling.ohio-state.edu/research/groups/lacqueys/readings/horowitz.pdf) ·
[Loewen & Sato 2018](https://www.cambridge.org/core/product/78A156EE200F744F5978F99BFB073DBE) ·
[Newton, split-information tasks](https://ir.wgtn.ac.nz/handle/123456789/27079) ·
[FOE14 slides on peer feedback](https://conference.pixel-online.net/FOE/files/foe/ed0014/PPT/8835-ELRN6471-PPT-FOE14.pdf) ·
[Strava kudos study (Running Magazine)](https://runningmagazine.ca/?p=91520)

Press and analysis: [The World of Chinese 2018](https://theworldofchinese.com/2018/06/learning-difficulties) ·
[LingoDeer: Tandem review](https://blog.lingodeer.com/tandem-app-review/) ·
[Mezzoguild: Speaky](https://www.mezzoguild.com/speaky-review/) ·
[ProdLab: Clubhouse](https://prodlab.substack.com/p/from-hype-to-hibernate-the-clubhouse) ·
[Appfigures: Clubhouse](https://appfigures.com/resources/insights/20220701/amp?f=4) ·
[DAME: Clubhouse moderation](https://damemagazine.com/2022/08/08/clubhouse-a-study-in-failed-content-moderation) ·
[TechCrunch: Airchat](https://techcrunch.com/2024/04/13/airchat-launch/) ·
[Shacknews: Death Stranding](https://shacknews.com/article/125784/a-big-goal-of-death-stranding-directors-cut-was-improving-the-asynchronous-multiplayer) ·
[GamesRadar: Kojima](https://gamesradar.com/kojima-is-most-proud-of-death-strandings-positive-shared-world-multiplayer-approach) ·
[Game Developer: Journey](https://www.gamedeveloper.com/design/cutting-corners-networking-design-in-journey) ·
[MCV: Jenova Chen](https://mcvuk.com/development-news/jenova-chen-reveals-secrets-of-journey-design/) ·
[GamesBeat: Dark Souls II messages](https://gamesbeat.com/how-did-dark-souls-iis-in-game-message-system-affect-player-behavior) ·
[Kotaku: Souls messages](https://kotaku.com/souls-games-are-great-except-for-the-sexist-messages-f-1828561485) ·
[Wordle](https://dinogame.gg/blog/why-wordle-blew-up/) ·
[Platformer: BeReal](https://platformer.news/how-bereal-missed-its-moment) ·
[Dazed: BeReal](https://www.dazeddigital.com/life-culture/article/61166/1/why-did-bereal-fail-social-media-instagram-authenticity) ·
[Built In: Jackbox](https://builtin.com/articles/jackbox-games-design-party-pack) ·
[Critical play: Quiplash](https://mechanicsofmagic.com/2024/04/24/critical-play-quiplash-other-jackbox-games-ellie/) ·
[Poets.org: exquisite corpse](https://poets.org/glossary/exquisite-corpse) ·
[Kolaj: exquisite corpse](https://kolajmagazine.com/content/content/articles/exquisite-corpse-introduction)

Several engagement figures quoted by third parties (Duolingo "5.6×", Clubhouse retention) come
from secondary sources and are labelled as such above. Discord study servers, Among Us, Twitch
Plays, Geocaching, Bumble BFF, murder-mystery parties and radio call-in shows are described from
general knowledge, not researched for this note.
