import { useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import { apiErrorCode, apiErrorKey } from '@/api/messages';
import { Avatar } from '@/components/avatar/avatar';
import { Button } from '@/components/button';
import { HeroLayout } from '@/components/hero-layout';
import { Icon, type IconName } from '@/components/icon';
import { Pop, Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { HeaderButton } from '@/components/step-header';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { useScreenLayout } from '@/hooks/use-screen-layout';
import { commitFeedback } from '@/lib/haptics';
import { heroDrawingSize } from '@/lib/layout';
import { staggerDelay } from '@/lib/motion';
import { backOr } from '@/lib/navigation';
import { ROUTES } from '@/lib/routes';
import { StageGate } from '@/onboarding/gate';
import { languageInText } from '@/onboarding/names';
import { useOnboardingStore } from '@/onboarding/services';
import type { OnboardingData } from '@/onboarding/store';
import { SETUP } from '@/screens/create-account/sample-content';
import { useTheme } from '@/theme';

// The guide's portrait on the design's frame (pt), and the share of a tall window its panel takes.
const AVATAR_FRAME = 168;
const HERO_SHARE = 0.36;

// What the test is like, in the order the learner wonders about it.
const FACTS = [
  { key: 'time', icon: 'clock' },
  { key: 'relaxed', icon: 'message' },
  { key: 'result', icon: 'barChart' },
] as const satisfies readonly { key: string; icon: IconName }[];

function Intro({ data }: { data: OnboardingData }) {
  const { t } = useTranslation();
  const { color } = useTheme();
  const store = useOnboardingStore();
  const { illustrationWidth } = useScreenLayout(HERO_SHARE);
  const { height: windowHeight } = useWindowDimensions();
  const [skipping, setSkipping] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const { catalog, essentials } = data;
  const name = SETUP.guide.name;
  const avatarSize = heroDrawingSize({
    frame: AVATAR_FRAME,
    available: illustrationWidth,
    windowHeight,
  });

  async function skip() {
    setProblem(null);
    setSkipping(true);
    try {
      await store.skipPlacement();
      router.replace(ROUTES.onboardingPartners);
    } catch (error) {
      setProblem(t(apiErrorKey(apiErrorCode(error))));
    } finally {
      setSkipping(false);
    }
  }

  return (
    <HeroLayout
      panel
      heroShare={HERO_SHARE}
      screenHeader={
        <View className="min-h-tap flex-row items-center pb-2">
          <HeaderButton
            icon="chevronLeft"
            label={t('common.back')}
            onPress={() => backOr(ROUTES.onboardingReview)}
          />
        </View>
      }
      hero={
        <View className="items-center gap-4">
          <Pop>
            <Avatar look={SETUP.guide.look} size={avatarSize} />
          </Pop>
          {essentials.selfAssessedLevel ? (
            <Reveal delay={staggerDelay(2)}>
              <View className="rounded-pill bg-chip px-3 py-1.5">
                <Text variant="captionStrong" tone="muted" className="text-center">
                  {t('onboarding.placement.intro.estimate', {
                    level: t(`onboarding.level.levels.${essentials.selfAssessedLevel}.label`),
                  })}
                </Text>
              </View>
            </Reveal>
          ) : null}
        </View>
      }
      body={
        <>
          <Reveal delay={staggerDelay(3)}>
            <Text variant="title" accessibilityRole="header">
              {t('onboarding.placement.intro.title')}
            </Text>
          </Reveal>
          <Reveal delay={staggerDelay(4)}>
            <Text tone="muted">
              {t('onboarding.placement.intro.body', {
                name,
                language: languageInText(catalog, essentials.targetLanguage ?? '', t),
              })}
            </Text>
          </Reveal>
          <View className="gap-3 pt-1">
            {FACTS.map((fact, i) => (
              <Reveal key={fact.key} delay={staggerDelay(5 + i)}>
                <View className="flex-row items-center gap-3">
                  <View
                    aria-hidden
                    style={{ width: size.avatarSm, height: size.avatarSm }}
                    className="items-center justify-center rounded-md bg-primary-soft"
                  >
                    <Icon name={fact.icon} color={color.primaryText} size={size.iconMd} />
                  </View>
                  <Text variant="callout" className="flex-1">
                    {t(`onboarding.placement.intro.facts.${fact.key}`)}
                  </Text>
                </View>
              </Reveal>
            ))}
          </View>
        </>
      }
      actions={
        <>
          {problem ? (
            <NoticeBox icon="alert" tone="danger">
              {problem}
            </NoticeBox>
          ) : null}
          <Button
            label={t('onboarding.placement.intro.start')}
            leading={<Icon name="mic" color={color.onPrimary} size={size.iconMd} />}
            disabled={skipping}
            onPress={() => {
              commitFeedback();
              router.push(ROUTES.onboardingPlacementTalk);
            }}
          />
          <TextButton
            tone="primary"
            label={t('onboarding.placement.intro.skip')}
            accessibilityHint={t('onboarding.placement.intro.skipNote')}
            disabled={skipping}
            onPress={skip}
          />
        </>
      }
    />
  );
}

/**
 * 4.4 Placement intro: what the spoken test is, how long it takes and that nothing can go wrong
 * in it (spec §6.1.1 step 4). The learner starts it or postpones it; postponed, practice starts
 * at their own estimate.
 */
export function PlacementIntroScreen() {
  return (
    <StageGate
      allowed={(status) => status.stage === 'placement'}
      header={<View className="min-h-tap" />}
    >
      {(data) => <Intro data={data} />}
    </StageGate>
  );
}
