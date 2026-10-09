import { View } from 'react-native';
import { motion } from '@konvami/design-tokens';
import type { Language } from '@/i18n';
import { LogoMark } from '@/components/brand';
import { Loop, Pop } from '@/components/motion';
import { Text } from '@/components/text';
import { useScreenLayout } from '@/hooks/use-screen-layout';
import { ILLUSTRATION_MAX_FONT_SCALE } from '@/lib/layout';
import { staggerDelay } from '@/lib/motion';

/**
 * The Welcome illustration: the app icon in a dashed orbit, greeted in each UI language.
 * Drawn on the design's 390×330 frame and scaled to the available width, so it keeps its shape on
 * every screen. The logo pops in, the dashed orbit slowly turns, and the greetings pop in one by
 * one, then float. Decorative: hidden from screen readers.
 */
const FRAME = { width: 390, height: 330 } as const;
const RING = { size: 280, left: 55, top: 25 } as const;
const DISC = { size: 188, left: 101, top: 71 } as const;
const LOGO = { size: 116, left: 137, top: 107 } as const;

type Corner = 'tl' | 'tr' | 'bl' | 'br';
type Greeting = {
  language: Language;
  text: string;
  /** Position on the 390×330 frame: one horizontal and one vertical edge. */
  at: { left?: number; right?: number; top: number };
  /** The square corner of the bubble, pointing at the logo. */
  tail: Corner;
};

// Greetings stay in their own language whatever the UI language is.
const GREETINGS: readonly Greeting[] = [
  { language: 'de', text: 'Hallo!', at: { left: 52, top: 22 }, tail: 'bl' },
  { language: 'fr', text: 'Bonjour !', at: { right: 40, top: 52 }, tail: 'br' },
  { language: 'it', text: 'Ciao!', at: { left: 34, top: 246 }, tail: 'tr' },
  { language: 'en', text: 'Hello!', at: { right: 50, top: 272 }, tail: 'tl' },
];

const DOT: Record<Language, string> = {
  de: 'bg-lang-de',
  fr: 'bg-lang-fr',
  it: 'bg-lang-it',
  en: 'bg-lang-en',
};

const TAIL: Record<Corner, string> = {
  tl: 'rounded-tl-sm',
  tr: 'rounded-tr-sm',
  bl: 'rounded-bl-sm',
  br: 'rounded-br-sm',
};

// Motion: the disc and logo pop first, then each greeting pops in turn and keeps floating.
const ORDER = { disc: 0, logo: 1, greetings: 4 } as const;
// How far a greeting floats up and down (pt), and the offset between neighbours (ms).
const FLOAT_DISTANCE = 4;
const FLOAT_OFFSET = 600;

const TURN = {
  from: { transform: [{ rotate: '0deg' }] },
  to: { transform: [{ rotate: '360deg' }] },
};
const FLOAT = {
  from: { transform: [{ translateY: 0 }] },
  to: { transform: [{ translateY: -FLOAT_DISTANCE }] },
};

export function GreetingOrbit() {
  const { illustrationWidth } = useScreenLayout();
  const width = Math.min(illustrationWidth, FRAME.width);
  const k = width / FRAME.width;
  const box = (b: { size: number; left: number; top: number }) => ({
    position: 'absolute' as const,
    width: b.size * k,
    height: b.size * k,
    left: b.left * k,
    top: b.top * k,
  });

  return (
    <View style={{ width, height: FRAME.height * k, pointerEvents: 'none' }} aria-hidden>
      <Loop keyframes={TURN} duration={motion.orbit} linear style={box(RING)}>
        <View className="h-full w-full rounded-pill border border-dashed border-field-border" />
      </Loop>
      <Pop delay={staggerDelay(ORDER.disc)} style={box(DISC)}>
        <View className="h-full w-full rounded-pill bg-surface" />
      </Pop>
      <Pop delay={staggerDelay(ORDER.logo)} style={box(LOGO)}>
        <LogoMark size={LOGO.size * k} tile />
      </Pop>
      {GREETINGS.map((g, i) => (
        <Pop
          key={g.language}
          delay={staggerDelay(ORDER.greetings + i * 2)}
          style={{
            position: 'absolute',
            top: g.at.top * k,
            ...(g.at.left !== undefined
              ? { left: g.at.left * k }
              : { right: (g.at.right ?? 0) * k }),
          }}
        >
          <Loop keyframes={FLOAT} duration={motion.float} delay={i * FLOAT_OFFSET} alternate>
            <View
              className={`flex-row items-center gap-1.5 rounded-button border border-border bg-chip px-3 py-2 ${TAIL[g.tail]}`}
            >
              <View className={`h-2 w-2 rounded-pill ${DOT[g.language]}`} />
              <Text
                variant="labelSmall"
                className="font-display"
                maxFontSizeMultiplier={ILLUSTRATION_MAX_FONT_SCALE}
              >
                {g.text}
              </Text>
            </View>
          </Loop>
        </Pop>
      ))}
    </View>
  );
}
