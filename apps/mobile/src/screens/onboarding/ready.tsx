import { useEffect, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import { apiErrorCode, apiErrorKey } from '@/api/messages';
import { useSession } from '@/auth';
import { LogoMark } from '@/components/brand';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { HeroLayout } from '@/components/hero-layout';
import { Pop, Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { PersonaAvatar } from '@/components/persona-avatar';
import { Text } from '@/components/text';
import { useScreenLayout } from '@/hooks/use-screen-layout';
import { commitFeedback, successFeedback } from '@/lib/haptics';
import { heroDrawingSize } from '@/lib/layout';
import { staggerDelay } from '@/lib/motion';
import { ROUTES } from '@/lib/routes';
import type { StartingLevel } from '@/onboarding/essentials';
import { StageGate } from '@/onboarding/gate';
import { languageName } from '@/onboarding/names';
import { useOnboardingStore } from '@/onboarding/services';
import type { OnboardingData } from '@/onboarding/store';
import { usePartners } from '@/onboarding/use-partners';

// The drawing on the design's frame (pt): the logo mark with the partners' portraits under it.
const FRAME = 220;
const LOGO = 96;
const PORTRAIT = size.avatarLg;
// The hero's share of a tall window: the summary card fits below.
const HERO_SHARE = 0.4;
// Joins the partners' names on one line.
const SEPARATOR = ', ';

/** The Konvami mark and the learner's partners, popping in one after another. Decorative. */
function ReadyIllustration({ data }: { data: OnboardingData }) {
  const { illustrationWidth } = useScreenLayout(HERO_SHARE);
  const { height: windowHeight } = useWindowDimensions();
  const width = heroDrawingSize({ frame: FRAME, available: illustrationWidth, windowHeight });
  const k = width / FRAME;
  return (
    <View aria-hidden style={{ pointerEvents: 'none' }} className="items-center gap-4">
      <Pop>
        <LogoMark size={LOGO * k} />
      </Pop>
      <View className="flex-row justify-center gap-2.5">
        {(data.partners ?? []).map((partner, i) => (
          <Pop key={partner.id} delay={staggerDelay(i + 2)}>
            <View className="rounded-pill border-2 border-on-splash">
              <PersonaAvatar look={partner.look} diameter={PORTRAIT * k} />
            </View>
          </Pop>
        ))}
      </View>
    </View>
  );
}

function SummaryRow({ label, value, badge }: { label: string; value: string; badge?: string }) {
  return (
    <View className="gap-1">
      <Text variant="overline" tone="subtle">
        {label}
      </Text>
      <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
        <Text variant="label" className="shrink">
          {value}
        </Text>
        {badge ? (
          <View className="rounded-sm bg-surface px-1.5 py-1">
            <Text variant="badge" tone="muted">
              {badge}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function Ready({ data }: { data: OnboardingData }) {
  const { t } = useTranslation();
  const { user } = useSession();
  const store = useOnboardingStore();
  // The partners are a nicety here: without them the summary simply has one line less.
  usePartners('read');
  const [entering, setEntering] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const { catalog, essentials, profile, partners } = data;

  // One success haptic, with the celebration it belongs to.
  useEffect(() => successFeedback(), []);

  const start = profile.languages[essentials.targetLanguage ?? '']?.starting_level;
  const level = (start?.value ?? essentials.selfAssessedLevel) as StartingLevel | null;

  async function enter() {
    commitFeedback();
    setProblem(null);
    setEntering(true);
    try {
      await store.complete();
      router.replace(ROUTES.home);
    } catch (error) {
      setProblem(t(apiErrorKey(apiErrorCode(error))));
    } finally {
      setEntering(false);
    }
  }

  return (
    <HeroLayout
      panel="splash"
      heroShare={HERO_SHARE}
      hero={<ReadyIllustration data={data} />}
      body={
        <>
          <Reveal delay={staggerDelay(4)}>
            <Text variant="title" accessibilityRole="header">
              {user?.firstName
                ? t('onboarding.ready.title', { name: user.firstName })
                : t('onboarding.ready.titleNoName')}
            </Text>
          </Reveal>
          <Reveal delay={staggerDelay(5)}>
            <Text tone="muted">{t('onboarding.ready.body')}</Text>
          </Reveal>
          <Reveal delay={staggerDelay(6)}>
            <Card className="mt-2 gap-3.5 bg-bg p-4">
              <SummaryRow
                label={t('onboarding.ready.learning')}
                value={languageName(catalog, essentials.targetLanguage ?? '', t)}
              />
              {level ? (
                <SummaryRow
                  label={t('onboarding.ready.level')}
                  value={t(`onboarding.level.levels.${level}.label`)}
                  badge={t(
                    start?.source === 'measured'
                      ? 'onboarding.ready.levelSource.measured'
                      : 'onboarding.ready.levelSource.asked',
                  )}
                />
              ) : null}
              {partners?.length ? (
                <SummaryRow
                  label={t('onboarding.ready.partners')}
                  value={partners.map((partner) => partner.name).join(SEPARATOR)}
                />
              ) : null}
            </Card>
          </Reveal>
        </>
      }
      actions={
        <>
          {problem ? (
            <NoticeBox icon="alert" tone="danger">
              {problem}
            </NoticeBox>
          ) : null}
          <Reveal delay={staggerDelay(8)}>
            <Button label={t('onboarding.ready.start')} loading={entering} onPress={enter} />
          </Reveal>
        </>
      }
    />
  );
}

/**
 * 4.8 Ready: what was set up, read back once, and the way into the app. Entering completes
 * onboarding, so the next launch opens the app itself.
 */
export function ReadyScreen() {
  return (
    <StageGate
      allowed={(status) => status.stage === 'ready'}
      header={<View className="min-h-tap" />}
    >
      {(data) => <Ready data={data} />}
    </StageGate>
  );
}
