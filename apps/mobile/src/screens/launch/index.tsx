import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import { motion } from '@konvami/design-tokens';
import { LogoMark, Wordmark } from '@/components/brand';
import { Loop, Pop, Reveal } from '@/components/motion';
import { Text } from '@/components/text';
import { pct, staggerDelay } from '@/lib/motion';
import { useTheme } from '@/theme';

// Sizes (pt) as on the design: the bubble mark, the wordmark height, and the loading dots.
const MARK_SIZE = 120;
const WORDMARK_HEIGHT = 32;
const DOTS = 3;
const DOT_SIZE = 7;
// How high a loading dot hops (pt), and the gap between neighbouring hops (ms).
const DOT_HOP = 6;
const DOT_WAVE_GAP = 140;

// The mark pops in first; the wordmark, tagline and dots follow (positions in the stagger).
const ORDER = { wordmark: 3, tagline: 5, dots: 7 } as const;

const HOP = {
  from: { transform: [{ translateY: 0 }], opacity: 0.45 },
  [pct(30)]: { transform: [{ translateY: -DOT_HOP }], opacity: 1 },
  [pct(60)]: { transform: [{ translateY: 0 }], opacity: 0.45 },
  to: { transform: [{ translateY: 0 }], opacity: 0.45 },
};

const BREATHE = {
  from: { transform: [{ scale: 1 }] },
  to: { transform: [{ scale: 1.04 }] },
};

/** Three dots hopping in a wave while the app gets ready. */
function LoadingDots() {
  const { t } = useTranslation();
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t('common.loading')}
      className="flex-row gap-2"
    >
      {Array.from({ length: DOTS }, (_, i) => (
        <Loop key={i} keyframes={HOP} duration={motion.breathe / 2} delay={i * DOT_WAVE_GAP}>
          <View
            style={{ width: DOT_SIZE, height: DOT_SIZE }}
            className="rounded-pill bg-on-splash"
          />
        </Loop>
      ))}
    </View>
  );
}

/**
 * 1.1 Splash: the brand moment at launch, continuing the native splash (same ground). The mark
 * pops in and breathes, the wordmark and tagline rise, and the dots hop while the app loads.
 */
export function LaunchScreen() {
  const { t } = useTranslation();
  const { color } = useTheme();
  return (
    <View className="flex-1 items-center justify-center bg-splash px-6">
      <StatusBar style="light" />
      <View className="flex-1 items-center justify-center gap-5">
        <Pop>
          <Loop keyframes={BREATHE} duration={motion.breathe} delay={motion.enter} alternate>
            <LogoMark size={MARK_SIZE} />
          </Loop>
        </Pop>
        <Reveal delay={staggerDelay(ORDER.wordmark)}>
          <Wordmark height={WORDMARK_HEIGHT} color={color.onSplash} label={t('common.appName')} />
        </Reveal>
        <Reveal delay={staggerDelay(ORDER.tagline)}>
          <Text tone="onSplashMuted" className="text-center">
            {t('common.tagline')}
          </Text>
        </Reveal>
      </View>
      <View className="pb-16">
        <Reveal delay={staggerDelay(ORDER.dots)}>
          <LoadingDots />
        </Reveal>
      </View>
    </View>
  );
}
