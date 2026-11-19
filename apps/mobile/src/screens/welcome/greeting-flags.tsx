import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { flag, motion } from '@konvami/design-tokens';
import { Animate, Pop } from '@/components/motion';
import { Text } from '@/components/text';
import { ILLUSTRATION_MAX_FONT_SCALE } from '@/lib/layout';
import type { Keyframes } from '@/lib/motion';

/**
 * The Welcome picture (v4): a greeting in a speech bubble on its country's flag. Every few
 * seconds the next greeting takes over and its flag fades in over the last one: Germany, France,
 * Italy, Switzerland, the first markets. Decorative: hidden from screen readers, ignores touches.
 * With Reduce Motion the first greeting stays.
 */
type Country = keyof typeof flag;
type Greeting = { country: Country; text: string };

// Greetings stay in their own language whatever the UI language is.
const GREETINGS: readonly Greeting[] = [
  { country: 'de', text: 'Hallo.' },
  { country: 'fr', text: 'Bonjour.' },
  { country: 'it', text: 'Ciao.' },
  { country: 'ch', text: 'Grüezi.' },
];

// The Swiss cross, as shares of the panel's shorter side (the flag's own proportions: 6/20 arms).
const CROSS_ARM = 0.42;
const CROSS_WIDTH = CROSS_ARM * 0.3;
// The bubble's tail: a square turned 45°, half outside the bubble's lower edge (pt): its side,
// how far in from the bubble's left edge, how far it pokes out, and its rounded tip.
const TAIL = { side: 26, left: 36, poke: 15, tip: 6 } as const;
// Where the cross stands: a third of the way down, clear of the bubble at the bottom.
const CROSS_TOP = '34%';

// The new flag fades in over the last one.
const FADE: Keyframes = { from: { opacity: 0 }, to: { opacity: 1 } };

function Flag({ country, side }: { country: Country; side: number }) {
  if (country === 'ch') {
    const arm = side * CROSS_ARM;
    const width = side * CROSS_WIDTH;
    return (
      <View className="absolute inset-0" style={{ backgroundColor: flag.ch[0] }}>
        <View
          className="absolute left-1/2"
          style={{
            top: CROSS_TOP,
            transform: [{ translateX: -arm / 2 }, { translateY: -arm / 2 }],
          }}
        >
          <View style={{ width: arm, height: arm }}>
            <View
              className="absolute"
              style={{ left: (arm - width) / 2, width, height: arm, backgroundColor: flag.ch[1] }}
            />
            <View
              className="absolute"
              style={{
                top: (arm - width) / 2,
                height: width,
                width: arm,
                backgroundColor: flag.ch[1],
              }}
            />
          </View>
        </View>
      </View>
    );
  }
  // Germany's stripes lie across; France's and Italy's stand up.
  return (
    <View className={`absolute inset-0 ${country === 'de' ? 'flex-col' : 'flex-row'}`}>
      {flag[country].map((stripe, i) => (
        <View key={`${stripe}-${i}`} className="flex-1" style={{ backgroundColor: stripe }} />
      ))}
    </View>
  );
}

export function GreetingFlags() {
  const { t } = useTranslation();
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [side, setSide] = useState(0);
  useEffect(() => {
    if (reduced) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % GREETINGS.length), motion.greeting);
    return () => clearInterval(timer);
  }, [reduced]);

  const greeting = GREETINGS[index] ?? GREETINGS[0]!;
  const before = GREETINGS[(index + GREETINGS.length - 1) % GREETINGS.length]!;
  const label =
    greeting.country === 'ch'
      ? t('welcome.swissGerman')
      : t(`onboarding.languages.${greeting.country}`);

  return (
    <View
      aria-hidden
      pointerEvents="none"
      className="flex-1 justify-end"
      onLayout={(e) => setSide(Math.min(e.nativeEvent.layout.width, e.nativeEvent.layout.height))}
    >
      {/* The last flag stays under the new one while it fades in, so the ground is never empty. */}
      {index > 0 || !reduced ? <Flag country={before.country} side={side} /> : null}
      <Animate
        key={`flag-${index}`}
        keyframes={FADE}
        duration={motion.slow}
        style={{ position: 'absolute', inset: 0 }}
      >
        <Flag country={greeting.country} side={side} />
      </Animate>
      <View className="absolute left-5 top-5 rounded-pill border-2 border-brand-on-bubble bg-brand-speech px-3 py-1.5">
        <Text
          variant="overline"
          tone="inherit"
          className="text-brand-on-bubble"
          maxFontSizeMultiplier={ILLUSTRATION_MAX_FONT_SCALE}
        >
          {label}
        </Text>
      </View>
      <View className="items-start p-5 pb-10">
        <Pop key={`bubble-${index}`}>
          <View className="rounded-hero border-[3px] border-brand-on-bubble bg-brand-speech px-6 pb-3 pt-1">
            <View
              className="absolute border-b-[3px] border-r-[3px] border-brand-on-bubble bg-brand-speech"
              style={{
                left: TAIL.left,
                bottom: -TAIL.poke,
                width: TAIL.side,
                height: TAIL.side,
                borderBottomRightRadius: TAIL.tip,
                transform: [{ rotate: '45deg' }],
              }}
            />
            <Text
              variant="langHero"
              tone="inherit"
              className="text-brand-on-bubble"
              maxFontSizeMultiplier={ILLUSTRATION_MAX_FONT_SCALE}
            >
              {greeting.text}
            </Text>
          </View>
        </Pop>
      </View>
    </View>
  );
}
