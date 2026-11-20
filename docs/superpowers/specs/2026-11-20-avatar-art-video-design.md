# Avatar art packs and realistic video avatars

Spec §6.20 (P2 "realistic"), §18 Phase 3 ("realistic video avatar vendor spike"), §21.3 item 2
(avatar art sourcing). Screens 6.6 Persona Studio, 6.16 Avatar editor, 5.3 Conversation. No new
screen numbers.

Both need someone outside the repository: an artist for the art, a vendor account (and its price)
for the video. This change builds what lets each drop in without app or server changes beyond a
provider class, and keeps everything off until then.

## 1. Art packs

**Problem.** The partners are drawn in code (`components/avatar`). Decision D17 asks for a
painterly, realistic style that needs a character artist. The stored look is already a few part
names (`AvatarLook`), so only the renderer has to change.

**What was built.**

- `drawing.ts`: the portrait's geometry, moved out of `avatar.tsx` unchanged.
- `art-pack.ts`: the pack contract. A pack is a map of layer keys to pictures (SVG text or a
  bitmap). The fixed stacking order is `PORTRAIT_SLOTS` (backdrop … glasses), then the moving parts
  (brows and resting mouth per expression and `hmm`, eye whites, irises, eye lines, a mouth per
  speaking shape, optional teeth and hand). A key is `slot[.part][.colour]`. A key with the colour
  is a full-colour picture; without it the picture is tinted with the look's palette entry.
  `packCovers` says whether a pack can draw a look completely.
- `avatar.tsx`: one component, two painters. The drawn painter is the previous drawing. The pack
  painter stacks the pack's layers in the same `Animated` wrappers, so breathing, blinking,
  expressions, the "hmm" pose, the thumbs-up and the seven mouth shapes behave the same.
- `sample-pack.ts`: the drawn portrait serialised into pack layers, all tinted. It proves the
  loader and is the artist's placement reference (`EXPO_PUBLIC_AVATAR_PACK=konvami-sample`).
- `pnpm avatar:packs` (`scripts/avatar-packs.ts`): reads `design/avatar-art/packs/<id>/`, inlines
  SVGs, copies PNGs to `apps/mobile/assets/avatar-packs/` and writes `packs.generated.ts`.
- `design/avatar-art/BRIEF.md`: the artist's deliverables, layer list, sizes, names, expressions,
  mouth shapes, light and dark, and how to try a pack locally.

**My calls.**

- **Layered images, not Rive.** Rive needs a native module (a new dependency and a new
  development build) and an artist who rigs in Rive. Layered images reuse the existing motion and
  can be painted in any tool. A Rive pack can come later as a third painter behind the same
  `Painter` interface.
- **Tinted or full colour per layer**, chosen by the file name. An artist can deliver one tinted
  set first and paint full-colour skin tones afterwards, without a format change.
- **A pack that cannot draw a look falls back to the drawn portrait** for that look. A
  half-finished pack never shows a face without a mouth.
- **The pack is chosen per build** (`EXPO_PUBLIC_AVATAR_PACK`), not per learner. One art style
  per release keeps the store screenshots honest. An unknown id draws the code portrait.
- **The drawn portrait stays the default.** With no variable set, nothing changes. The sample
  pack draws the same face (visual check: section 3).

## 2. Realistic video avatars

**Problem.** Spec §6.20 P2 wants an optional realistic face during calls. Every option is a paid
vendor that streams video. None is chosen or paid for.

**What was built (off by default).**

- Server: `domain/video_avatars.py` holds the `VideoAvatarVendor` interface and
  `VideoAvatarService`. `providers/video_avatar.py` holds the vendor registry, which is empty.
  `KONVAMI_VIDEO_AVATARS` configures `{vendor, faces}` and `KONVAMI_VIDEO_AVATAR_SECRET_ARN` the
  key. Migration `0210_video_avatar` adds two tables: the face picked per partner, and the
  agreement per vendor. The endpoints are `GET /v1/video-avatars`,
  `PUT /v1/video-avatars/personas/{id}` and `POST /v1/video-avatars/sessions`. Both tables are in
  the data export.
- App: `voice/video-avatar.tsx` holds the connector registry (empty) and `useVideoAvatar`.
  `components/avatar/video-face.tsx` shows the stream in the round frame (`<video>` on the web,
  `RTCView` on phones). `CallStage` takes an optional `video` feed. Persona Studio's Look part
  offers the faces (`video-face-choice.tsx`).

**What has to hold before a vendor sees anything:** a vendor is configured **and** implemented
**and** has its key; the learner may use it (the premium voices' gate, Pro once plans are on);
the learner agreed to **that** vendor; a face was picked for the partner. Otherwise there is no
session and the portrait is drawn. While no connector exists, the app does not even ask the
server. A vendor failure also draws the portrait: the face is never the reason a call fails.

**My calls.**

- **Consent in the sheet where the face is picked, recorded per vendor**, not a new version of
  the 2.5 consent record. The video face is an optional extra of one partner. Its notice names
  the vendor and what it receives: the partner's voice and words, never the learner's voice. A
  vendor change asks again. The privacy policy and 6.7 must name the vendor before one is
  switched on (section 4).
- **Stock faces from the vendor**, picked per partner. A realistic face does not match the drawn
  look parts. Custom replicas of a real person are excluded (spec §16.3: invented characters).
- **The vendor only gets the face id and the language.** No account id, no persona backstory.

### Vendor comparison (for the owner's decision)

These are what each vendor offered as of my knowledge (mid-2026). **Prices and terms change:
check each vendor's current price page and DPA before choosing.** No vendor was called or signed
up for.

| | Simli | HeyGen (Interactive / LiveAvatar) | Tavus (CVI) | D-ID (Streams / Agents) |
| --- | --- | --- | --- | --- |
| Input | Audio in (PCM), lip-sync only | Text (its own TTS) or audio; also its own LLM | Its full pipeline; an "echo" mode for your own audio | Text or audio |
| Output | WebRTC video | WebRTC (LiveKit) | WebRTC (Daily) | WebRTC |
| Latency | Lowest of the four (sub-second, lip-sync only) | Higher when its TTS runs | Low in its own pipeline; echo mode adds a hop | Medium |
| Price | Per minute, lowest tier of the four | Credits per minute, mid | Per minute, highest (full conversational stack) | Credits per minute, mid |
| EU data | US-hosted; DPA on request | US; enterprise DPA | US; DPA | Israel/US; GDPR DPA |
| Fit with OpenAI realtime audio | **Best**: feed it the partner's audio, show its video | Text mode would give a second voice; audio mode works | Its pipeline would replace ours; echo mode only | Audio mode works |

**Recommendation (my call):** an **audio-in, lip-sync-only vendor (Simli-type)** behind
`VideoAvatarVendor`. Our voice, tools, recordings, live corrections and costs stay where they are,
and only the face is bought. Plan the vendor spike as:

1. Audio routing. The partner's audio arrives on the phone over WebRTC. The vendor needs it with
   little delay. Either the call worker feeds the vendor the same audio the premium-voice path
   already produces (`LiveSpeech`, spec §9.2), or the phone forwards the received track. Then
   the app plays the vendor stream's audio and mutes the call's, so lips and voice stay in sync.
   `VideoFace` mutes the stream today. That changes with the connector.
2. Measure the delay and the cost per minute from Switzerland on a real call. Meter the minutes in
   cost control (spec §6.19) inside the provider.
3. Name the vendor in the privacy policy (four languages), 6.7 and the store privacy labels, and
   check its DPA and no-training terms.

## 3. Verification

- Backend: `pytest` (domain, persistence against PostgreSQL, API), `ruff`, `mypy`.
- App: `tsc`, `eslint`, `jest`. The new tests are `art-pack.test.ts`, `avatar.test.tsx`,
  `video-avatar.test.tsx` and the studio's video face cases.
- Visual: the avatar editor and Persona Studio in the web build, drawn and with
  `EXPO_PUBLIC_AVATAR_PACK=konvami-sample`, light and dark. The two must look the same.

## 4. Left for the owner, an artist and a vendor

- **Artist:** paint a pack to `design/avatar-art/BRIEF.md`, then run `pnpm avatar:packs` and set
  `EXPO_PUBLIC_AVATAR_PACK` in the EAS environment (spec §21.3 item 2: who commissions it).
- **Owner:** choose a video vendor (section 2), open the account, accept its DPA, store the key in
  Secrets Manager through Terraform, and set `KONVAMI_VIDEO_AVATARS` and
  `KONVAMI_VIDEO_AVATAR_SECRET_ARN` on the API function (not wired in `infra/` yet).
- **Code, after that:** the vendor's provider (server) and connector (app), the audio routing of
  section 2, metering, and the privacy texts.
