/**
 * Konvami design tokens, v2 ("graphite + deep teal"), taken from the approved design canvas
 * (docs/design/README.md). Every color, font, size and radius in the apps comes from here:
 * never write a hex value, font name or magic size in a component.
 *
 * Both themes define the same keys, so a component never needs to know which theme is active.
 */

const light = {
  /** Screen background. */
  bg: '#FFFFFF',
  /** Raised panels: intro hero, brand tiles. */
  surface: '#F5F5F4',
  /** Cards and chips placed on a surface. */
  chip: '#FFFFFF',
  field: '#F7F7F6',
  fieldBorder: '#E1E3E0',
  border: '#E7E7E4',
  /** Primary text. */
  fg: '#141716',
  /** Secondary text (body copy under titles). */
  fgMuted: '#4B5250',
  /** Tertiary text (captions, metadata). */
  fgSubtle: '#646B69',
  primary: '#0F766E',
  onPrimary: '#FFFFFF',
  primarySoft: '#E7F2F0',
  primaryText: '#0D5F58',
  focus: 'rgba(15,118,110,0.16)',
  warnSoft: '#FEF3C7',
  warnText: '#92400E',
  warnIcon: '#D97706',
  /** The learner-error underline in transcripts. */
  warnMark: '#F59E0B',
  success: '#15803D',
  successSoft: '#ECF6EF',
  danger: '#B91C1C',
  dangerBorder: '#DC2626',
  dangerSoft: '#FEF2F2',
  dangerTitle: '#991B1B',
  secondaryBg: '#FFFFFF',
  /** "Continue with Apple": black in light mode, white in dark (Apple's button guidelines). */
  appleBg: '#000000',
  appleFg: '#FFFFFF',
  /** Inactive progress: page dots, chart tracks. */
  track: '#E1E3E0',
  disabledBg: '#E1E3E0',
  disabledFg: '#6F7674',
  shadow: 'rgba(20,23,22,0.08)',
  /** The first-launch splash ground. */
  splash: '#0F766E',
  onSplash: '#FFFFFF',
  onSplashMuted: 'rgba(255,255,255,0.86)',
  scrim: 'rgba(14,17,17,0.45)',
} as const;

export type ColorToken = keyof typeof light;
export type Palette = Record<ColorToken, string>;

const dark: Palette = {
  bg: '#0E1111',
  surface: '#171B1B',
  chip: '#1D2222',
  field: '#171B1B',
  fieldBorder: '#2C3332',
  border: '#262C2B',
  fg: '#F1F4F3',
  fgMuted: '#B3BCB9',
  fgSubtle: '#929B98',
  primary: '#14B8A6',
  onPrimary: '#042F2C',
  primarySoft: '#10302C',
  primaryText: '#5EEAD4',
  focus: 'rgba(20,184,166,0.25)',
  warnSoft: '#2B2210',
  warnText: '#FCD34D',
  warnIcon: '#F59E0B',
  warnMark: '#F59E0B',
  success: '#4ADE80',
  successSoft: '#0F2918',
  danger: '#F87171',
  dangerBorder: '#EF4444',
  dangerSoft: '#2A1414',
  dangerTitle: '#FECACA',
  secondaryBg: '#171B1B',
  appleBg: '#FFFFFF',
  appleFg: '#000000',
  track: '#2C3332',
  disabledBg: '#252B2A',
  disabledFg: '#7D8684',
  shadow: 'rgba(0,0,0,0.45)',
  splash: '#0E1111',
  onSplash: '#FFFFFF',
  onSplashMuted: 'rgba(255,255,255,0.86)',
  scrim: 'rgba(0,0,0,0.6)',
};

/** Fixed brand colors: the same in both themes. Used by the logo and the greeting bubble. */
export const brand = {
  tile: '#0F766E',
  face: '#134E4A',
  bubble: '#FFFFFF',
  tongue: '#F472B6',
  tongueLine: '#DB2777',
  /** Text inside the white greeting bubble, which stays white in both themes. */
  onBubble: '#141716',
  /** The knob of a switch: white in both themes. */
  thumb: '#FFFFFF',
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
  /** Brows, lashes and irises. */
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
  /** Lexend SemiBold: titles and the wordmark. */
  display: 'Lexend_600SemiBold',
  /**
   * Inter: interface text. One family per weight (custom fonts ignore fontWeight on Android).
   * Never name a key `sans`, `serif` or `mono`: NativeWind's native preset redefines those classes
   * with system fonts and would silently replace ours on iOS and Android.
   */
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemibold: 'Inter_600SemiBold',
  bodyBold: 'Inter_700Bold',
} as const;

export type FontFamilyToken = keyof typeof fontFamily;

/**
 * Type scale. Sizes are the default (100%) text size; the OS text-size setting scales them, so
 * layouts must never rely on a text block's height.
 */
export const type = {
  title: { family: 'display', size: 28, lineHeight: 34, letterSpacing: -0.56 },
  heading: { family: 'display', size: 18, lineHeight: 24 },
  stat: { family: 'display', size: 22, lineHeight: 26 },
  body: { family: 'body', size: 16, lineHeight: 24 },
  button: { family: 'bodySemibold', size: 17, lineHeight: 22 },
  label: { family: 'bodySemibold', size: 16, lineHeight: 22 },
  labelSmall: { family: 'bodySemibold', size: 14, lineHeight: 20 },
  chat: { family: 'bodyMedium', size: 15, lineHeight: 20 },
  emphasis: { family: 'bodySemibold', size: 17, lineHeight: 24 },
  callout: { family: 'body', size: 14.5, lineHeight: 20 },
  small: { family: 'body', size: 13.5, lineHeight: 19 },
  caption: { family: 'body', size: 12.5, lineHeight: 17 },
  captionStrong: { family: 'bodySemibold', size: 12, lineHeight: 16 },
  overline: { family: 'bodySemibold', size: 12, lineHeight: 16, letterSpacing: 0.72 },
  micro: { family: 'body', size: 10.5, lineHeight: 13 },
  /** Smaller body text for dense screens (consent details, reassurance lists). */
  bodySmall: { family: 'body', size: 15, lineHeight: 22 },
  labelMedium: { family: 'bodySemibold', size: 15, lineHeight: 21 },
  /** Labels above form fields and the step counter. */
  fieldLabel: { family: 'bodySemibold', size: 13, lineHeight: 18 },
  /** One digit of a verification code. */
  code: { family: 'display', size: 24, lineHeight: 30 },
  /** The selected row of a wheel picker, and the rows next to it. */
  wheel: { family: 'bodySemibold', size: 20, lineHeight: 26 },
  wheelNear: { family: 'body', size: 18, lineHeight: 24 },
  /** Tiny uppercase tags ("REQUIRED", "AI"). */
  badge: { family: 'bodyBold', size: 10.5, lineHeight: 13, letterSpacing: 0.5 },
} as const satisfies Record<
  string,
  { family: FontFamilyToken; size: number; lineHeight: number; letterSpacing?: number }
>;

export type TypeToken = keyof typeof type;

/** Corner radii. */
export const radius = {
  sm: 6,
  md: 10,
  field: 12,
  button: 14,
  card: 18,
  panel: 20,
  hero: 32,
  device: 44,
  pill: 999,
} as const;

/** Component and layout sizes. */
export const size = {
  /** Smallest tappable area (Apple HIG 44 pt; Material 48 dp is met by hitSlop). */
  minTapTarget: 44,
  buttonHeight: 54,
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
