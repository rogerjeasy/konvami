# Konvami brand assets

**Konvami** = German *Konversation* + French *ami* (friend). The logo is a smiling speech bubble with a playful tongue, because in French (*langue*) and Italian (*lingua*) "tongue" and "language" are the same word.

Open `index.html` for the visual brand guide (colours, type, usage rules, every asset, and config snippets).

## Colours

| Token | Hex | Use |
|---|---|---|
| Teal | `#14B8A6` | Gradient start, accents |
| Indigo | `#4F46E5` | Gradient end, primary actions, splash background |
| Face Ink | `#4338CA` | Eyes and smile in the mark |
| Tongue Pink | `#F472B6` | Tongue (full-colour versions only) |
| Deep Ink | `#1E1B4B` | Wordmark and text on light backgrounds |
| Night | `#0B1020` | Dark backgrounds, dark splash |
| Mist | `#EEF2FF` | Light backgrounds |

Brand gradient: 135°, teal → indigo.

## Type

- **Lexend SemiBold (600)**: wordmark and headings. The wordmark SVGs are converted to outlines.
- **Inter**: interface text.
- Both fonts use the SIL Open Font License.

## Files

```
svg/   master vectors (edit these, then re-export)
  konvami-icon-rounded.svg        marketing icon with rounded corners
  konvami-icon-square.svg         full-bleed icon (stores apply their own mask)
  konvami-background.svg          gradient background only
  konvami-mark.svg                bubble face only (splash)
  konvami-mark-adaptive.svg       bubble face inside Android's 66% safe zone
  konvami-mark-mono-*.svg         single-colour mark (themed icons, notifications, print)
  konvami-mark-tinted.svg         single-colour mark filled with the gradient
  konvami-wordmark-*.svg          "Konvami" wordmark, outlined (gradient / ink / white)
  konvami-lockup-*.svg            icon + wordmark (gradient / ink / white)
png/
  ios/icon-1024.png               Expo "icon" and iOS (RGB, no alpha)
  android/adaptive-*-1024.png     adaptive foreground / background / monochrome
  android/notification-icon-96.png
  splash/splash-icon-1024.png     use with backgroundColor #4F46E5 (dark: #0B1020)
  store/app-store-icon-1024.png   App Store Connect
  store/play-store-icon-512.png   Google Play Console
  web/                            favicon.ico, favicon-16/32/48, apple-touch-icon-180, icon-192/512 (maskable + rounded)
  marketing/                      lockups, wordmarks, tinted mark (transparent PNGs)
```

## Using the assets in the Expo app (later, during implementation)

Copy `png/` to `assets/brand/` in the app and reference it from `app.config.ts`. A full snippet is in `index.html`:

- `icon` → `ios/icon-1024.png`
- `android.adaptiveIcon` → `foregroundImage`, `backgroundImage`, `monochromeImage`
- `expo-splash-screen` plugin → `splash/splash-icon-1024.png`, `backgroundColor: "#4F46E5"`, `dark.backgroundColor: "#0B1020"`
- `expo-notifications` plugin → `android/notification-icon-96.png`, `color: "#4F46E5"`

## Name status (checked 2026-10-06)

Free on the App Store (US, DE, FR, CH), Google Play, the Swiss commercial register (Zefix), GitHub, exact-match web search and TMview trademarks (EUIPO plus national offices including Switzerland). The domains `konvami.com`, `.app`, `.ch`, `.de`, `.fr`, `.it` and `.io` were unregistered.

**Next steps to secure it:**
1. Register the domains.
2. File the Swiss (IPI) and EU (EUIPO) trademarks in classes 9 and 41.
3. Reserve "Konvami" in App Store Connect and Google Play Console.
4. Reserve the social handles.
