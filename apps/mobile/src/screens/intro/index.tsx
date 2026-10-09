import { useCallback, useState, type ComponentType } from 'react';
import { useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedRef } from 'react-native-reanimated';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/button';
import { HeroLayout } from '@/components/hero-layout';
import { PagerDots, Recede, usePagerScroll } from '@/components/pager';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { commitFeedback, stepFeedback } from '@/lib/haptics';
import { ROUTES } from '@/lib/routes';
import { CorrectionsIllustration, MemoryIllustration, SpeakIllustration } from './illustrations';

type Slide = {
  key: 'speak' | 'corrections' | 'memory';
  Illustration: ComponentType<{ play: boolean }>;
};

/** Screens 1.2–1.4. Order here is the order shown. */
const SLIDES: readonly Slide[] = [
  { key: 'speak', Illustration: SpeakIllustration },
  { key: 'corrections', Illustration: CorrectionsIllustration },
  { key: 'memory', Illustration: MemoryIllustration },
];

/**
 * The intro: three slides that can be swiped or stepped with the button. Each slide's scene plays
 * as it slides onto the screen (again when you come back to it). Skip and the last button go to
 * Welcome.
 */
export function IntroScreen() {
  const { t } = useTranslation();
  // Each page fills the window, so the pinned action stays on screen inside the horizontal pager.
  const { width, height } = useWindowDimensions();
  const pager = useAnimatedRef<Animated.ScrollView>();
  const [index, setIndex] = useState(0);

  const onPageChange = useCallback((page: number) => {
    setIndex(page);
    stepFeedback();
  }, []);
  const { position, onScroll, isOnScreen } = usePagerScroll(width, SLIDES.length, onPageChange);

  const finish = useCallback(() => {
    commitFeedback();
    router.replace(ROUTES.welcome);
  }, []);

  const next = useCallback(() => {
    pager.current?.scrollTo({ x: (index + 1) * width, animated: true });
  }, [index, pager, width]);

  return (
    <Animated.ScrollView
      // Re-mounts on rotation / window resize so pages snap to the new width.
      key={width}
      ref={pager}
      testID="intro-pager"
      horizontal
      pagingEnabled
      bounces={false}
      showsHorizontalScrollIndicator={false}
      contentOffset={{ x: index * width, y: 0 }}
      onScroll={onScroll}
      scrollEventThrottle={16}
      className="flex-1 bg-bg"
    >
      {SLIDES.map((slide, i) => {
        const last = i === SLIDES.length - 1;
        return (
          // Each page clips its own content, so nothing can ever draw over a neighbouring slide.
          <View key={slide.key} style={{ width, height, overflow: 'hidden' }}>
            <HeroLayout
              panel
              heroHeader={
                <TextButton
                  label={t('common.skip')}
                  accessibilityHint={t('common.skipHint')}
                  onPress={finish}
                />
              }
              hero={
                <Recede position={position} page={i}>
                  <slide.Illustration play={isOnScreen(i)} />
                </Recede>
              }
              body={
                <View className="gap-3.5">
                  <PagerDots position={position} count={SLIDES.length} active={i} />
                  <Text variant="title" accessibilityRole="header" className="mt-1">
                    {t(`intro.${slide.key}.title`)}
                  </Text>
                  <Text tone="muted">{t(`intro.${slide.key}.body`)}</Text>
                </View>
              }
              actions={
                <Button
                  label={last ? t('common.getStarted') : t('common.continue')}
                  onPress={last ? finish : next}
                />
              }
            />
          </View>
        );
      })}
    </Animated.ScrollView>
  );
}
