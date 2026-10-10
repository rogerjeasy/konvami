import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import type { Placement, PlacementChoice, PlacementResult } from '@konvami/api-client';
import { apiErrorCode, apiErrorKey } from '@/api/messages';
import { Avatar } from '@/components/avatar/avatar';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Icon } from '@/components/icon';
import { IconTile } from '@/components/icon-tile';
import { LoadState } from '@/components/load-state';
import { Pop, Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { OptionCard } from '@/components/option-card';
import { StepLayout } from '@/components/step-layout';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { commitFeedback, stepFeedback, successFeedback } from '@/lib/haptics';
import { staggerDelay } from '@/lib/motion';
import { ROUTES } from '@/lib/routes';
import type { StartingLevel } from '@/onboarding/essentials';
import { OnboardingGate } from '@/onboarding/gate';
import { routeForOnboarding } from '@/onboarding/routing';
import { useOnboardingStore } from '@/onboarding/services';
import type { OnboardingData } from '@/onboarding/store';
import { SETUP } from '@/screens/create-account/sample-content';
import { useTheme } from '@/theme';

// How often the server is asked while the test is being assessed (ms), and how many times
// before the wait is given up: about a minute and a half, well beyond a normal assessment.
const POLL_MS = 2000;
const MAX_POLLS = 45;

/** The skills of a result, in the order they are shown. */
const SKILLS = ['speaking', 'listening', 'grammar', 'vocabulary', 'pronunciation'] as const;

/** Statuses of a test whose result is still on its way. */
const PENDING: readonly Placement['status'][] = ['in_progress', 'assessing'];

type Progress =
  | { phase: 'waiting' }
  /** The wait was given up: the test call probably never ended properly. */
  | { phase: 'stalled' }
  | { phase: 'failed'; code: string }
  | { phase: 'known'; placement: Placement };

/** Follows the placement test until it has a result (or clearly will not get one). */
function usePlacementProgress(): Progress & { retry: () => void } {
  const store = useOnboardingStore();
  const [progress, setProgress] = useState<Progress>({ phase: 'waiting' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let polls = 0;
    async function check() {
      try {
        const placement = await store.checkPlacement();
        if (!current) return;
        if (!PENDING.includes(placement.status)) {
          setProgress({ phase: 'known', placement });
        } else if ((polls += 1) >= MAX_POLLS) {
          setProgress({ phase: 'stalled' });
        } else {
          timer = setTimeout(check, POLL_MS);
        }
      } catch (error) {
        if (current) setProgress({ phase: 'failed', code: apiErrorCode(error) });
      }
    }
    void check();
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [store, attempt]);

  return {
    ...progress,
    retry: () => {
      setProgress({ phase: 'waiting' });
      setAttempt((count) => count + 1);
    },
  };
}

/** The top row: these screens are reached by finishing something, so there is no way back. */
const HEADER = <View className="min-h-tap" />;

function Waiting() {
  const { t } = useTranslation();
  const { color } = useTheme();
  const label = t('onboarding.placement.result.waiting');
  return (
    <StepLayout header={HEADER}>
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={label}
        accessibilityLiveRegion="polite"
        className="flex-1 items-center justify-center gap-4 py-10"
      >
        {/* Head tilted, as while she prepares a reply: she is the one working this out. */}
        <Avatar look={SETUP.guide.look} size={size.avatarLg} mood="thinking" />
        <ActivityIndicator color={color.primary} />
        <View className="items-center gap-1.5">
          <Text variant="heading" className="text-center">
            {label}
          </Text>
          <Text tone="muted" className="text-center">
            {t('onboarding.placement.result.waitingBody')}
          </Text>
        </View>
      </View>
    </StepLayout>
  );
}

/** The test did not produce a result: take it again, or start at the own estimate. */
function Inconclusive() {
  const { t } = useTranslation();
  const store = useOnboardingStore();
  const [skipping, setSkipping] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function skip() {
    commitFeedback();
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
    <StepLayout
      header={HEADER}
      actions={
        <>
          {problem ? (
            <View className="pb-2">
              <NoticeBox icon="alert" tone="danger">
                {problem}
              </NoticeBox>
            </View>
          ) : null}
          <Button
            label={t('onboarding.placement.result.retry')}
            disabled={skipping}
            onPress={() => {
              commitFeedback();
              router.replace(ROUTES.onboardingPlacementTalk);
            }}
          />
          <TextButton
            tone="primary"
            label={t('onboarding.placement.result.skip')}
            disabled={skipping}
            onPress={skip}
          />
        </>
      }
    >
      <Reveal>
        <View className="gap-5">
          <IconTile icon="refresh" />
          <View className="gap-2.5">
            <Text variant="title" accessibilityRole="header">
              {t('onboarding.placement.result.inconclusiveTitle')}
            </Text>
            <Text tone="muted">{t('onboarding.placement.result.inconclusiveBody')}</Text>
          </View>
        </View>
      </Reveal>
    </StepLayout>
  );
}

/** One skill: its name, its level, and how far up the scale that is. */
function SkillRow({
  name,
  level,
  scale,
}: {
  name: string;
  level: StartingLevel;
  /** Every level, lowest first. The first one ("no usable language yet") fills nothing. */
  scale: readonly StartingLevel[];
}) {
  const { t } = useTranslation();
  const reached = scale.indexOf(level);
  return (
    <View
      accessible
      accessibilityLabel={t('onboarding.placement.result.skillLevel', { skill: name, level })}
      className="gap-1.5"
    >
      <View className="flex-row items-baseline justify-between gap-3">
        <Text variant="labelSmall" className="flex-1">
          {name}
        </Text>
        <Text variant="labelSmall" tone="primary">
          {level}
        </Text>
      </View>
      <View aria-hidden className="flex-row gap-1">
        {scale.slice(1).map((step, i) => (
          <View
            key={step}
            style={{ height: size.progressHeight }}
            className={`flex-1 rounded-sm ${i < reached ? 'bg-primary' : 'bg-track'}`}
          />
        ))}
      </View>
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="gap-2.5">
      <Text variant="overline" tone="subtle">
        {title}
      </Text>
      {children}
    </View>
  );
}

function Result({
  data,
  placement,
  result,
}: {
  data: OnboardingData;
  placement: Placement;
  result: PlacementResult;
}) {
  const { t } = useTranslation();
  const { color } = useTheme();
  const store = useOnboardingStore();
  // The learner chooses only while nothing is settled and the two levels differ.
  const choosing = placement.status === 'measured' && placement.selfAssessed !== null;
  const [choice, setChoice] = useState<PlacementChoice>('measured');
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const scale = data.catalog.startingLevels;
  const levelLabel = (level: StartingLevel) => t(`onboarding.level.levels.${level}.label`);

  // One success haptic, with the result it belongs to.
  useEffect(() => successFeedback(), []);

  async function proceed() {
    commitFeedback();
    setProblem(null);
    setSaving(true);
    try {
      if (choosing) await store.decidePlacement(choice);
      const status = store.getState().data?.status;
      router.replace((status && routeForOnboarding(status)) ?? ROUTES.home);
    } catch (error) {
      setProblem(t(apiErrorKey(apiErrorCode(error))));
    } finally {
      setSaving(false);
    }
  }

  const options = choosing
    ? ([
        {
          use: 'measured',
          level: result.overall,
          hint: t('onboarding.placement.result.measuredHint'),
        },
        {
          use: 'self',
          level: placement.selfAssessed ?? result.overall,
          hint: t('onboarding.placement.result.ownHint'),
        },
      ] as const)
    : [];

  return (
    <StepLayout
      header={HEADER}
      actions={
        <>
          {problem ? (
            <View className="pb-2">
              <NoticeBox icon="alert" tone="danger">
                {problem}
              </NoticeBox>
            </View>
          ) : null}
          <Button label={t('common.continue')} loading={saving} onPress={proceed} />
        </>
      }
    >
      <View className="items-center gap-4">
        <Pop>
          <View
            aria-hidden
            style={{ width: size.levelBadge, height: size.levelBadge }}
            className="items-center justify-center rounded-pill border-2 border-primary bg-primary-soft"
          >
            <Text variant="stat" tone="primary">
              {result.overall}
            </Text>
          </View>
        </Pop>
        <Reveal delay={staggerDelay(2)}>
          <View className="items-center gap-2">
            <Text variant="overline" tone="subtle">
              {t('onboarding.placement.result.overline')}
            </Text>
            <Text variant="title" accessibilityRole="header" className="text-center">
              {levelLabel(result.overall)}
            </Text>
            <Text tone="muted" className="text-center">
              {t(
                placement.differs
                  ? 'onboarding.placement.result.differs'
                  : 'onboarding.placement.result.matches',
              )}
            </Text>
          </View>
        </Reveal>
      </View>

      <Reveal delay={staggerDelay(3)}>
        <Card className="gap-3.5 p-4">
          {SKILLS.map((skill) => (
            <SkillRow
              key={skill}
              name={t(`onboarding.placement.result.skills.${skill}`)}
              level={result.levels[skill] ?? result.overall}
              scale={scale}
            />
          ))}
        </Card>
      </Reveal>

      {choosing ? (
        <Reveal delay={staggerDelay(4)}>
          <Section title={t('onboarding.placement.result.chooseTitle')}>
            <View
              accessibilityRole="radiogroup"
              accessibilityLabel={t('onboarding.placement.result.chooseTitle')}
              className="gap-2.5"
            >
              {options.map((option) => (
                <OptionCard
                  key={option.use}
                  role="radio"
                  label={levelLabel(option.level)}
                  description={option.hint}
                  selected={choice === option.use}
                  onPress={() => {
                    stepFeedback();
                    setChoice(option.use);
                  }}
                />
              ))}
            </View>
          </Section>
        </Reveal>
      ) : null}

      {result.weakAreas.length ? (
        <Reveal delay={staggerDelay(5)}>
          <Section title={t('onboarding.placement.result.weakTitle')}>
            <View className="gap-2.5">
              {result.weakAreas.map((area) => (
                <View key={area} className="flex-row items-start gap-2.5">
                  <View className="pt-0.5">
                    <Icon name="target" color={color.primaryText} size={size.icon} />
                  </View>
                  <Text variant="callout" className="flex-1">
                    {area}
                  </Text>
                </View>
              ))}
            </View>
          </Section>
        </Reveal>
      ) : null}
    </StepLayout>
  );
}

function Outcome({ data }: { data: OnboardingData }) {
  const { t } = useTranslation();
  const progress = usePlacementProgress();

  if (progress.phase === 'waiting') return <Waiting />;
  if (progress.phase === 'stalled') return <Inconclusive />;
  if (progress.phase === 'failed') {
    return (
      <StepLayout header={HEADER}>
        <LoadState
          failed
          loadingLabel={t('onboarding.placement.result.waiting')}
          slowLabel={t('onboarding.placement.result.waitingBody')}
          failedLabel={t(
            progress.code === 'network'
              ? 'errors.network'
              : 'onboarding.placement.result.loadFailed',
          )}
          retryLabel={t('onboarding.retry')}
          onRetry={progress.retry}
        />
      </StepLayout>
    );
  }

  const { placement } = progress;
  if (placement.status === 'inconclusive') return <Inconclusive />;
  if (placement.result && (placement.status === 'measured' || placement.status === 'decided')) {
    return <Result data={data} placement={placement} result={placement.result} />;
  }
  // No test was taken (or it was postponed): there is no result to show here.
  if (placement.status === 'not_started') return <Redirect href={ROUTES.onboardingPlacement} />;
  return <Redirect href={routeForOnboarding(data.status) ?? ROUTES.home} />;
}

/**
 * 4.6 Placement result: waits while the test is assessed, then shows the level per skill and
 * what to work on first. When the result differs from the learner's own estimate, they choose
 * where to start: the app never changes the level silently (spec §6.1.3).
 */
export function PlacementResultScreen() {
  return <OnboardingGate header={HEADER}>{(data) => <Outcome data={data} />}</OnboardingGate>;
}
