# Konvami avatar art: brief for the character artist

Konvami's conversation partners are drawn today in code from a few shapes (spec §6.20, decision
D17). This brief tells an artist how to deliver a painted art pack that the app shows instead,
without code changes. The app's sample pack (`apps/mobile/src/components/avatar/sample-pack.ts`)
is the drawn portrait cut into exactly these layers. Use it as the reference for placement.

## 1. What a partner is made of

A partner's look is a short list of names, never a picture:

| Part | Values |
| --- | --- |
| Skin | `porcelain`, `sand`, `honey`, `chestnut`, `umber` |
| Hair style | `short`, `parted`, `bob`, `long`, `bun`, `curls`, `bald` |
| Hair colour | `black`, `espresso`, `chestnut`, `auburn`, `blond`, `silver` |
| Top (clothing) | `teal`, `graphite`, `stone`, `amber` |
| Backdrop | `stone`, `mist`, `sand`, `slate` |
| Face shape | `oval`, `round`, `narrow` |
| Eye colour | `brown`, `hazel`, `green`, `blue`, `grey` |
| Extras | glasses, beard, age lines (each on or off) |

The pack has to draw every combination, so it is made of layers that stack. The colours are in
`packages/design-tokens/src/tokens.ts` (`avatar`). Ask for the hex values; do not invent new ones.

## 2. The canvas

- Every layer is a **square of the same size**, the whole portrait, transparent where the layer
  has nothing. Deliver **1024 × 1024 PNG** (sRGB, transparent background) or **SVG** on a
  `0 0 200 200` view box.
- The portrait sits in a **circle**: anything outside the inscribed circle is cut off. Keep the
  face in the centre, the eye line at 48 % of the height, the lip line at 58 %. These are the
  points the head tilts and the eyes blink around.
- The app scales the portrait from 40 pt (lists) to about 240 pt (a call). It has to read at 40 pt.
- One set serves **light and dark mode**: the portrait is a picture, like a photo, and does not
  change with the theme. Check it on both a near-white and a near-black page.

## 3. Tinted or full colour

Every layer can come in one of two ways:

- **Tinted:** drawn in white (PNG) or in `currentColor` (SVG) where its colour goes. The app
  fills it with the look's colour. One file serves every skin tone or hair colour. Shading inside
  a tinted layer goes in a separate untinted layer above it, or is left out.
- **Full colour:** painted for one value, with the value in the file name
  (`face.oval.umber.png`). The app uses it before the tinted file, for that value only.

Start tinted, then paint full-colour files where a tint looks flat (skin tones usually do).

## 4. The layers, bottom to top

A file is named by its layer key: the slot, the part, then optionally the colour value, joined by
dots. `{hair}` is a hair style, `{face}` a face shape, and so on.

### The still portrait

| # | File | Tint | Notes |
| --- | --- | --- | --- |
| 1 | `backdrop` / `backdrop.{backdrop}` | backdrop | The round ground. **Required.** |
| 2 | `hair-back.{hair}` / `…{hairColor}` | hair | Hair behind the head and shoulders (bob, long). Optional per style |
| 3 | `top` / `top.{top}` | top | Shoulders and clothing. **Required** |
| 4 | `skin-shade.{face}` / `…{skin}` | skin shadow | Neck and ears |
| 5 | `face.{face}` / `…{skin}` | skin | The face. **Required for every face shape** |
| 6 | `age-lines.{face}` / `…{skin}` | skin shadow | Only drawn when age lines are on |
| 7 | `beard` / `beard.{hairColor}` | hair | Only drawn with a beard |
| 8 | `hair-front.{hair}` / `…{hairColor}` | hair | The hairline, bun or curls. **Required for every style but bald** |
| 9 | `nose` / `nose.{skin}` | skin shadow | |
| 10 | `glasses` | glasses | Only drawn with glasses |

### The parts that move

These sit above the portrait. Each is its own layer so it can change without redrawing the face.

| File | Tint | Notes |
| --- | --- | --- |
| `brows.{expression}` | brows (ink) | **One per expression, and `brows.hmm`** |
| `eye-whites` | white | **Required.** Both eyes' whites |
| `irises` / `irises.{eyes}` | eye colour | **Required.** Both irises |
| `eye-lines` | ink | Pupils, lids and lashes. The app squashes the eye layers to blink and to widen or narrow them per expression, so the lid must sit on the eye line |
| `mouth-rest.{expression}` | lip | **One per expression, and `mouth-rest.hmm`**: the closed mouth |
| `mouth.{shape}` | mouth | **One per speaking shape** (below). The app crossfades between them as the partner speaks |
| `teeth.{shape}` | white | Optional teeth for a shape |
| `hand` / `hand.{skin}` | skin | Optional thumbs-up on the lower right. Without it the drawn one is shown |
| `hand-lines` | ink | The thumbs-up's outline |

**Expressions:** `neutral`, `happy`, `surprised`, `empathetic`, `encouraging`, `confused`,
`amused`, plus `hmm` (brows drawn together, lips pursed to one side: a thoughtful "let me check").

**Speaking shapes** (the app picks one from the voice level; not phoneme-accurate):

| Shape | Looks like |
| --- | --- |
| `narrow` | lips barely parted (soft "i", "e") |
| `mid` | half open |
| `open` | wide open ("a") |
| `round` | rounded, open ("o") |
| `pucker` | small and forward ("u", "ü") |
| `teeth` | upper teeth showing ("f", "s") |

A closed mouth is the expression's `mouth-rest`.

## 5. What makes a pack complete

The app uses a pack only for a look it can draw entirely: backdrop, top, the face for that face
shape, the front hair for that style (unless bald), eye whites and irises, brows and a resting
mouth for every expression and `hmm`, and a mouth for every speaking shape. For any other look it
quietly draws the coded portrait, so a pack can be delivered and tested in parts.

## 6. Trying a pack in the app

1. Put the files in `design/avatar-art/packs/<pack-id>/` (lower case and dashes, such as
   `studio-anna-v1`) with a `pack.json`: `{ "name": "Painted partners, first round" }`.
2. Run `pnpm avatar:packs` from the repository root. It checks the file names, copies PNGs into
   the app and writes `apps/mobile/src/components/avatar/packs.generated.ts`.
3. Run `pnpm --filter @konvami/mobile test -- avatar`. The tests reject a file name this brief
   does not list.
4. Set `EXPO_PUBLIC_AVATAR_PACK=<pack-id>` in `apps/mobile/.env` and start the web preview
   (`pnpm --filter @konvami/mobile web`). The avatar editor (Profile › My partners › a partner ›
   Look › Open the avatar editor) shows every part, expression, gesture and the speaking mouth.

## 7. Deliverables and rights

- The layered source files (PSD, Procreate or Figma) and the exports named as above.
- Full ownership or an exclusive, perpetual, worldwide licence for use in the app, the stores and
  marketing, with the right to change the art.
- No likeness of a real person. Partners are invented characters (spec §16.3).
- Avoid purple, lavender and glows; the app's colour blocks are tomato, forest with lime, butter,
  pink and ink.
