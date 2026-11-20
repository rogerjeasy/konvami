/**
 * Konvami design tokens, v4 ("colour-block stories"), taken from the approved v4 prototype
 * (docs/design/README.md). Every color, font, size and radius in the apps comes from here:
 * never write a hex value, font name or magic size in a component.
 *
 * Warm paper surfaces and ink text; each feature owns one colour block: talking is tomato, words
 * are pink, the streak is butter, the level is forest with lime. No purple, gradients or glows.
 *
 * Both themes define the same keys, so a component never needs to know which theme is active.
 */

const light = {
  /** Screen background: warm paper. */
  bg: '#F7F6F2',
  /** Raised panels and soft buttons (the prototype's "chip" ground). */
  surface: '#EEEDE7',
  /** Cards placed on the background. */
  chip: '#FFFFFF',
  field: '#FFFFFF',
  fieldBorder: '#E1DFD7',
  border: '#E1DFD7',
  /** Primary text: ink. */
  fg: '#141513',
  /** Secondary text (body copy under titles). */
  fgMuted: '#474843',
  /** Tertiary text (captions, metadata). */
  fgSubtle: '#5E5F59',
  /** The main action: an ink pill. */
  primary: '#141513',
  onPrimary: '#F7F6F2',
  /** A selected choice's soft ground and its text (lime tint, forest text). */
  primarySoft: '#ECF7D2',
  primaryText: '#0F3D2E',
  focus: 'rgba(20,21,19,0.16)',
  /** "Let's polish this": the amber of a learner's mistake, never red. */
  warnSoft: '#FFEFC2',
  warnText: '#7A4300',
  warnIcon: '#E08E00',
  /** The learner-error underline in transcripts. */
  warnMark: '#E08E00',
  success: '#1E7A45',
  successSoft: '#E4F3E8',
  danger: '#B42318',
  dangerBorder: '#D92D20',
  dangerSoft: '#FDEDEB',
  dangerTitle: '#912018',
  /**
   * A noun's article in its gender's colour on a card (der blue, die red, das green: spec §6.7,
   * the usual convention). Only the article is coloured, never a whole word or a mistake.
   */
  genderMasc: '#2350C8',
  genderFem: '#C2255C',
  genderNeut: '#1E7A45',
  secondaryBg: '#EEEDE7',
  /** "Continue with Apple": black in light mode, white in dark (Apple's button guidelines). */
  appleBg: '#000000',
  appleFg: '#FFFFFF',
  /** Inactive progress: page dots, chart tracks. */
  track: '#E1DFD7',
  disabledBg: '#E1DFD7',
  disabledFg: '#6A6B65',
  shadow: 'rgba(20,21,19,0.08)',
  /** The first-launch splash ground. */
  splash: '#0F3D2E',
  onSplash: '#EEF5E6',
  onSplashMuted: 'rgba(238,245,230,0.86)',
  scrim: 'rgba(15,16,14,0.45)',
  /** Colour blocks: each feature owns one pair (block, text on it). */
  tomato: '#FF5533',
  onTomato: '#1E0904',
  forest: '#0F3D2E',
  onForest: '#EEF5E6',
  /** Secondary text on forest (the call's translations). */
  onForestMuted: 'rgba(238,245,230,0.78)',
  lime: '#D4FF5C',
  onLime: '#0F3D2E',
  butter: '#FFD23F',
  onButter: '#2A1D00',
  pink: '#FFA3C4',
  onPink: '#4A0D25',
  /** The ink block: dark in light mode, paper in dark mode. */
  inverse: '#141513',
  onInverse: '#F7F6F2',
  /** The accent on the ink block (the open tab's icon, the week's topic). */
  inverseAccent: '#D4FF5C',
  /** A chip or control laid on a light colour block. */
  veil: 'rgba(0,0,0,0.12)',
  /** A chip or control laid on a dark colour block (forest). */
  veilLight: 'rgba(255,255,255,0.12)',
  /** A chip laid on the ink block, which is dark in light mode and light in dark mode. */
  inverseVeil: 'rgba(255,255,255,0.12)',
} as const;

export type ColorToken = keyof typeof light;
export type Palette = Record<ColorToken, string>;

const dark: Palette = {
  bg: '#0F100E',
  surface: '#23241F',
  chip: '#1A1B18',
  field: '#1A1B18',
  fieldBorder: '#2C2E29',
  border: '#2C2E29',
  fg: '#F3F2ED',
  fgMuted: '#C4C3BB',
  fgSubtle: '#9C9C94',
  primary: '#F3F2ED',
  onPrimary: '#0F100E',
  primarySoft: '#1F2A12',
  primaryText: '#D4FF5C',
  focus: 'rgba(212,255,92,0.3)',
  warnSoft: '#33270C',
  warnText: '#FFD27A',
  warnIcon: '#F5A623',
  warnMark: '#F5A623',
  success: '#7EDCA2',
  successSoft: '#10291A',
  danger: '#FF8A80',
  dangerBorder: '#F04438',
  dangerSoft: '#2A1412',
  dangerTitle: '#FECDCA',
  genderMasc: '#93B4FF',
  genderFem: '#FF8FB5',
  genderNeut: '#7EDCA2',
  secondaryBg: '#23241F',
  appleBg: '#FFFFFF',
  appleFg: '#000000',
  track: '#2C2E29',
  disabledBg: '#2C2E29',
  disabledFg: '#8A8A83',
  shadow: 'rgba(0,0,0,0.45)',
  splash: '#0F100E',
  onSplash: '#EEF5E6',
  onSplashMuted: 'rgba(238,245,230,0.86)',
  scrim: 'rgba(0,0,0,0.6)',
  tomato: '#FF5533',
  onTomato: '#1E0904',
  forest: '#133F31',
  onForest: '#EEF5E6',
  onForestMuted: 'rgba(238,245,230,0.78)',
  lime: '#D4FF5C',
  onLime: '#0F3D2E',
  butter: '#FFD23F',
  onButter: '#2A1D00',
  pink: '#FFA3C4',
  onPink: '#4A0D25',
  inverse: '#F3F2ED',
  onInverse: '#0F100E',
  inverseAccent: '#133F31',
  veil: 'rgba(0,0,0,0.12)',
  veilLight: 'rgba(255,255,255,0.12)',
  inverseVeil: 'rgba(0,0,0,0.12)',
};

/** Fixed brand colors: the same in both themes. Used by the logo and the greeting bubble. */
export const brand = {
  /** v4 logo: an ink tile with a lime bubble, forest eyes and smile, a tomato tongue. */
  tile: '#141513',
  face: '#0F3D2E',
  bubble: '#D4FF5C',
  tongue: '#FF5533',
  tongueLine: '#C2361C',
  /** Text inside the white greeting bubble, which stays white in both themes. */
  onBubble: '#141513',
  /** The greeting bubble on the Welcome flags: white in both themes. */
  speech: '#FFFFFF',
  /** The knob of a switch: white in both themes. */
  thumb: '#FFFFFF',
} as const;

/** The flags the Welcome greetings paint (1.5): fixed colours, as a flag is. */
export const flag = {
  de: ['#000000', '#DD0000', '#FFCE00'],
  fr: ['#002654', '#FFFFFF', '#ED2939'],
  it: ['#009246', '#FFFFFF', '#CE2B37'],
  ch: ['#DA291C', '#FFFFFF'],
} as const;

/**
 * Persona avatars (spec §6.20): illustrated portraits drawn from a few parts and colors. Fixed
 * colors, the same in both themes, like a photograph would be. A persona's look is a small
 * config of these names (`AvatarLook` in the app), never raw colors.
 */
export const avatar = {
  /** Skin: the lit tone and the shadow tone (neck, ears, under the hairline). */
  skin: {
    porcelain: { base: '#F1D3BF', shade: '#DDB49B' },
    sand: { base: '#E3BC98', shade: '#CB9E78' },
    honey: { base: '#CB9A70', shade: '#B07F56' },
    chestnut: { base: '#A26F49', shade: '#875A39' },
    umber: { base: '#6B442B', shade: '#553421' },
  },
  hair: {
    black: '#221C19',
    espresso: '#3D2B21',
    chestnut: '#6A452F',
    auburn: '#8B4A2B',
    blond: '#C7A268',
    silver: '#A3A5A2',
  },
  /** Clothing, within the app's palette: teal, graphite, stone, amber. */
  top: {
    teal: '#0F766E',
    graphite: '#2F3534',
    stone: '#C9C5BD',
    amber: '#B45309',
  },
  /** The round ground behind a portrait. */
  backdrop: {
    stone: '#E7E5E0',
    mist: '#D4E7E3',
    sand: '#F0E4D3',
    slate: '#D9DFDE',
  },
  /** Iris colors; the pupil and the lid line use `feature`. */
  eyes: {
    brown: '#5A3A28',
    hazel: '#7A5A2E',
    green: '#4F6B45',
    blue: '#4A6D8C',
    grey: '#6B7479',
  },
  /** Brows, lashes and pupils. */
  feature: '#231B17',
  eyeWhite: '#FFFFFF',
  lip: '#B4574F',
  /** The inside of an open mouth. */
  mouth: '#5B211F',
  glasses: '#2F3534',
} as const;

export type AvatarSkin = keyof typeof avatar.skin;
export type AvatarHairColor = keyof typeof avatar.hair;
export type AvatarTop = keyof typeof avatar.top;
export type AvatarBackdrop = keyof typeof avatar.backdrop;
export type AvatarEyes = keyof typeof avatar.eyes;

/** Other companies' logo colors, drawn exactly as their brand rules require. */
export const thirdParty = {
  google: { blue: '#4285F4', green: '#34A853', yellow: '#FBBC05', red: '#EA4335' },
} as const;

/** Language accent dots on the Welcome illustration (one per UI language). */
export const languageAccent = {
  de: '#0F766E',
  fr: '#D97706',
  it: '#DB2777',
  en: '#64748B',
} as const;

/** Font files as registered with expo-font (@expo-google-fonts). */
export const fontFamily = {
  /** Bricolage Grotesque ExtraBold: titles, big numbers and the wordmark. */
  display: 'BricolageGrotesque_800ExtraBold',
  /**
   * Figtree: interface text. One family per weight (custom fonts ignore fontWeight on Android).
   * Never name a key `sans`, `serif` or `mono`: NativeWind's native preset redefines those classes
   * with system fonts and would silently replace ours on iOS and Android.
   */
  body: 'Figtree_400Regular',
  bodyMedium: 'Figtree_500Medium',
  bodySemibold: 'Figtree_600SemiBold',
  bodyBold: 'Figtree_700Bold',
  bodyExtrabold: 'Figtree_800ExtraBold',
  /**
   * Instrument Serif Italic: the language being learned. German is always set in it, so what the
   * learner studies stands apart from the app's own words.
   */
  lang: 'InstrumentSerif_400Regular_Italic',
} as const;

export type FontFamilyToken = keyof typeof fontFamily;

/**
 * Type scale. Sizes are the default (100%) text size; the OS text-size setting scales them, so
 * layouts must never rely on a text block's height.
 */
export const type = {
  title: { family: 'display', size: 34, lineHeight: 36, letterSpacing: -1 },
  /** The biggest words on a screen: Today's greeting, the end of a conversation. */
  hero: { family: 'display', size: 42, lineHeight: 42, letterSpacing: -1.5 },
  /** A colour block's title (the partner's name on Today). */
  tileTitle: { family: 'display', size: 32, lineHeight: 33, letterSpacing: -1 },
  /** A section's heading on a screen ("Today's plan", "Milestones"). */
  section: { family: 'display', size: 22, lineHeight: 26, letterSpacing: -0.4 },
  heading: { family: 'display', size: 18, lineHeight: 22, letterSpacing: -0.3 },
  stat: { family: 'display', size: 28, lineHeight: 30, letterSpacing: -0.8 },
  /** A big number on a colour block (the streak, cards ready). */
  numeral: { family: 'display', size: 72, lineHeight: 66, letterSpacing: -3 },
  /** The level and the streak when they are the point of the screen. */
  jumbo: { family: 'display', size: 120, lineHeight: 108, letterSpacing: -6 },
  body: { family: 'body', size: 16, lineHeight: 23 },
  button: { family: 'bodyBold', size: 17, lineHeight: 21 },
  label: { family: 'bodyBold', size: 16, lineHeight: 22 },
  labelSmall: { family: 'bodyBold', size: 14, lineHeight: 20 },
  chat: { family: 'bodyMedium', size: 15, lineHeight: 20 },
  emphasis: { family: 'bodySemibold', size: 17, lineHeight: 24 },
  callout: { family: 'body', size: 14.5, lineHeight: 20 },
  small: { family: 'body', size: 13.5, lineHeight: 19 },
  caption: { family: 'body', size: 12.5, lineHeight: 17 },
  captionStrong: { family: 'bodyBold', size: 12, lineHeight: 16 },
  overline: { family: 'bodyBold', size: 12, lineHeight: 15, letterSpacing: 0.9 },
  micro: { family: 'body', size: 10.5, lineHeight: 13 },
  /** Smaller body text for dense screens (consent details, reassurance lists). */
  bodySmall: { family: 'body', size: 15, lineHeight: 22 },
  labelMedium: { family: 'bodyBold', size: 15, lineHeight: 21 },
  /** Labels above form fields and the step counter. */
  fieldLabel: { family: 'bodyBold', size: 13, lineHeight: 18 },
  /** One digit of a verification code. */
  code: { family: 'display', size: 24, lineHeight: 30 },
  /** The selected row of a wheel picker, and the rows next to it. */
  wheel: { family: 'bodySemibold', size: 20, lineHeight: 26 },
  wheelNear: { family: 'body', size: 18, lineHeight: 24 },
  /** Tiny uppercase tags ("REQUIRED", "AI"). */
  badge: { family: 'bodyExtrabold', size: 10.5, lineHeight: 13, letterSpacing: 0.5 },
  /** The language learned, inside interface text ("wants to hear about Luzern"). */
  langBody: { family: 'lang', size: 19, lineHeight: 24 },
  /** A line of a conversation. */
  langLine: { family: 'lang', size: 22, lineHeight: 27 },
  /** A sentence that is the point of a card (what you said, the better way). */
  langLarge: { family: 'lang', size: 25, lineHeight: 30 },
  /** The word on a flashcard. */
  langWord: { family: 'lang', size: 52, lineHeight: 56 },
  /** The Welcome greeting. */
  langHero: { family: 'lang', size: 76, lineHeight: 80, letterSpacing: -1.5 },
} as const satisfies Record<
  string,
  { family: FontFamilyToken; size: number; lineHeight: number; letterSpacing?: number }
>;

export type TypeToken = keyof typeof type;

/** Corner radii. */
export const radius = {
  sm: 8,
  md: 12,
  field: 16,
  /** Buttons are pills. */
  button: 999,
  card: 24,
  panel: 28,
  /** A colour block ("story tile"). */
  hero: 30,
  device: 44,
  pill: 999,
} as const;

/** Component and layout sizes. */
export const size = {
  /** Smallest tappable area (Apple HIG 44 pt; Material 48 dp is met by hitSlop). */
  minTapTarget: 44,
  buttonHeight: 56,
  fieldHeight: 52,
  iconSm: 14,
  icon: 16,
  iconMd: 20,
  iconLg: 24,
  avatarSm: 38,
  avatarMd: 46,
  /** A partner's portrait on their card. */
  avatarLg: 64,
  /** The partner on the Today screen's talk card: big enough to be seen breathing. */
  avatarHero: 88,
  /** A partner's portrait while their look is edited. */
  avatarXl: 132,
  /** The live preview in the avatar editor, where the portrait is the point of the screen. */
  avatarEditor: 176,
  /** The round badge that shows a measured level. */
  levelBadge: 92,
  /** The same badge beside a card's text (Today's level card). */
  levelBadgeSm: 56,
  /** One day of the week strip: a round mark, filled when practised. */
  dayMark: 32,
  /** The tab bar: its row of tabs when it lies along the bottom, its width as a side rail. */
  tabBarHeight: 60,
  tabRailWidth: 104,
  /** A round color choice (inside a 44 pt touch target). */
  swatch: 34,
  /** Rounded tile behind a screen's lead icon (2.4 Verify email). */
  iconTile: 72,
  /** Round back / close button in a screen header. */
  headerButton: 44,
  /** One segment of the step progress bar. */
  progressHeight: 4,
  /** A bar that shows a share of a whole (the learner's part of the talking). */
  meterHeight: 8,
  /** The width of one of the four steps of a grammar topic's mastery (5.14, 5.15). */
  masteryStep: 14,
  /** The tallest bar of a small bar chart (minutes per week). */
  chartHeight: 96,
  /** One cell of a week-by-week grid (how often a kind of mistake came up). */
  heatCell: 20,
  /** One box of the verification code. */
  codeBoxWidth: 48,
  codeBoxHeight: 58,
  switchWidth: 51,
  switchHeight: 31,
  switchThumb: 27,
  /** One row of a wheel picker; the wheel shows five. */
  wheelRow: 40,
  pageDot: 6,
  pageDotActive: 22,
  /** The readable text column; wider screens center it. */
  contentMaxWidth: 480,
  /** Widest a whole screen grows to on tablets and desktop web. */
  screenMaxWidth: 1040,
  /** Widest an illustration is drawn. */
  illustrationMaxWidth: 360,
} as const;

/** Spacing scale (pt). Tailwind's default 4-pt scale uses the same steps. */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 28,
  '4xl': 32,
  '5xl': 40,
} as const;

/** Window widths where layouts change. */
export const breakpoint = {
  /** Below this, phones are "compact": tighter gutters, smaller illustrations. */
  compact: 360,
  /** Tablets and landscape: content goes side by side. */
  wide: 768,
} as const;

/**
 * Motion (ms unless noted). Every animation must also respect Reduce Motion (fewer and gentler:
 * keep fades, drop movement, scale and overshoot).
 */
export const motion = {
  /** Press feedback: scale down while the finger is on a control. */
  press: 120,
  fast: 150,
  base: 250,
  /** Content entering the screen (fade + rise). */
  enter: 420,
  slow: 400,
  /** Delay between items revealed one after another. */
  stagger: 70,
  /** How far content rises when it enters (pt). */
  rise: 14,
  /** Scale a pressed control shrinks to. */
  pressScale: 0.97,
  /** Scale a popping element starts from (never 0: nothing appears from nothing). */
  popFrom: 0.85,
  /** Peak of a pop's overshoot before it settles at 1. */
  popOvershoot: 1.06,
  /** Shortest time the branded launch screen shows (the splash animation's length). */
  brandMoment: 1600,
  /** Ambient loops: the voice orb breathing, greetings floating, the orbit turning. */
  breathe: 2400,
  /** An avatar blinks once in this time. */
  blink: 4200,
  /** How fast an avatar's mouth follows the voice: one audio-level reading. */
  lipSync: 90,
  float: 3200,
  orbit: 60000,
  /** How long each Welcome greeting stays before the next country's flag spreads in. */
  greeting: 2200,
  /** A celebration's burst of colour pieces flying out and fading (a quest or milestone). */
  burst: 900,
  /** How far a burst's pieces fly from the middle (pt). */
  burstReach: 90,
  /** Cubic-bezier control points (CSS order). Never ease-in on UI. */
  easing: {
    /** Entering and exiting. */
    out: [0.23, 1, 0.32, 1],
    /** Moving on screen and ambient loops. */
    inOut: [0.77, 0, 0.175, 1],
  },
  /** Springs as Apple's designer parameters (Reanimated `duration` + `dampingRatio`). */
  spring: {
    /** Settle with no overshoot. */
    settle: { duration: 400, dampingRatio: 1 },
    /** A friendly pop for first-time, celebratory moments only. */
    pop: { duration: 550, dampingRatio: 0.55 },
  },
} as const;

/** Opacity for interaction states. */
export const opacity = {
  pressed: 0.85,
  disabled: 0.5,
  decorative: 0.75,
  /** Thin decorative rings on a colored hero. */
  ring: 0.14,
  /** The far rows of a wheel picker. */
  faded: 0.55,
} as const;

export type ColorScheme = 'light' | 'dark';

export const color: Readonly<Record<ColorScheme, Palette>> = { light, dark };
