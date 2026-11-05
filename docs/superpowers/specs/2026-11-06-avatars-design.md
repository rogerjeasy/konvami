# Avatars: expressions, mouth shapes and the avatar editor (5.3, 6.6, 6.16; spec §6.20)

Spec §6.20 lists, for P1, "viseme-accurate lip-sync, expressions, eye saccades, teaching gestures,
and an avatar editor in Persona Studio". This note covers the first, second, fourth and fifth;
eye saccades and milestone celebrations are not built.

## What the learner sees

- **During a call (5.3)** the partner's portrait can show how it feels: calm, happy, surprised,
  caring, encouraging, puzzled or amused. It holds the face for six seconds and returns to rest.
- **A thumbs-up** appears on the portrait when the partner asks for one (a correct use of what
  the learner is practising). **A thoughtful "hmm"** (head tilted, brows together, lips pursed)
  shows for two seconds when a live correction comes in under the learner's line.
- **The mouth** takes one of seven shapes while the partner speaks (closed, narrow, mid, open,
  round, pucker, teeth) instead of one opening and closing.
- **The avatar editor (6.16)** is opened from Look in Persona Studio (6.6) for an existing
  partner. It shows the portrait large, lets the learner try each expression, a thumbs-up and a
  speaking mouth, and changes every part of the look with the portrait following. "Save look"
  saves the look on its own.
- **Three new parts** in the look, in the studio's Look step and the editor: face shape (oval,
  round, narrow), eye colour (brown, hazel, green, blue, grey) and age lines.

## How it works

### Expressions (`set_expression`)

- A new tool on the practice partner (`services/api`: `domain/practice.py`), with
  `expression` (neutral, happy, surprised, empathetic, encouraging, confused, amused) and
  `gesture` (none, thumbs_up). The partner's instructions tell it to use its face now and then,
  never on every turn, and to use the thumbs-up only for something the learner just did right.
- The tool is **silent** (`ToolResult.silent`, `domain/tools.py`): the call worker answers it but
  does not ask for a new reply (`domain/live_call.py`). Without that, every `set_expression`
  would make the partner speak again after it finished its line. An unknown face does nothing and
  does not fail the call.
- The tool only runs in a practice call (and so in role-plays and lessons); the setup, the
  placement test and exam simulations have no use for it.
- The app (`voice/conversation.ts`) reads the request twice, from the provider's
  `response.function_call_arguments.done` (early, while the partner is still speaking) and from
  the server's answer, and counts one call once (`callId`). It validates the face against its own
  list: a face it cannot draw is ignored.
- `voice/use-avatar-face.ts` turns the request into the face shown and takes it back after
  `EXPRESSION_HOLD_MS`. A face the partner asked for wins over the "hmm".

### Mouth shapes (`lib/lip-sync.ts`)

True visemes need the audio samples; the WebRTC stack gives the app a voice **level** only (spec
§6.20.3 lists the ways to get the samples: a native module, or audio over a WebSocket, both
later). The shape is therefore chosen from how loud the voice is (soft speech narrows or rounds
the lips, loud speech opens wide) and varied every other poll (a shape is held for about 200 ms,
a short syllable). It reads as speech at a glance; it is not phoneme-accurate. The call hook
(`voice/use-voice-call.ts`) sets a `viseme` shared value on every poll next to `mouth`; the
avatar shows the shape that matches.

### Drawing (`components/avatar/avatar.tsx`)

The portrait stays a stack of SVG layers on one 200 × 200 box. Brows, eyes and the resting mouth
are layers of their own, driven by the expression; the eyes open or narrow with it. Nothing in
the stored look changes with an expression: it is a state of the screen, not of the partner.

### The look (`face`, `eyes`, `aged`)

- Stored with the rest of the look in the persona's JSON (`LookModel`, `Look`); no migration. The
  three fields default to oval, brown and no age lines, so a look stored before them draws the
  original portrait and the persona-writing model (whose schema is unchanged) needs no new
  fields.
- Colours (`avatar.eyes`) and the editor's portrait size (`size.avatarEditor`) are design tokens.

## Reduce Motion and the orb

- With Reduce Motion on, the head does not tilt or lean, and the mouth holds one open shape while
  the partner speaks instead of changing. Expressions still change (a change of face is
  information, not ambient motion). The thumbs-up pops in with a fade only.
- Spec §6.20.3 asks for a fall back to the voice orb on low battery or overheating. Neither is
  detected in the app yet, so there is no such fallback; the portrait is cheap to draw (SVG layers
  with opacity changes) and nothing here makes that worse.

## What is left out

- Eye saccades, celebrations on milestones, a gesture for every Live Error Spotter event.
- Phoneme-accurate lip-sync (needs the audio samples).
- Clothing and hair parts beyond the existing ones, an age slider, and a Persona Builder that
  fills the new parts from a description (the builder still writes the original parts).
- The editor for a partner still to be added: a new partner sets the parts in the studio's Look
  step, which has the new parts too.
