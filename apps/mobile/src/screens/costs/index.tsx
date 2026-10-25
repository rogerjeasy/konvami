import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import type { CostLevel, Costs } from '@konvami/api-client';
import { apiErrorCode } from '@/api/messages';
import { BarChart } from '@/components/bar-chart';
import { Card } from '@/components/card';
import { Icon, type IconName } from '@/components/icon';
import { LoadState } from '@/components/load-state';
import { Meter } from '@/components/meter';
import { Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { Section } from '@/components/section';
import { HeaderButton } from '@/components/step-header';
import { Text, type TextTone } from '@/components/text';
import { addMonths, daysInMonth, fromIsoDate, toIsoDate } from '@/lib/dates';
import { formatDayOfYear, formatMonth, formatUsd, wholeMinutes } from '@/lib/format';
import { staggerDelay } from '@/lib/motion';
import { useProfileServices } from '@/profile/services';
import type { ColorToken } from '@/theme';
import { useTheme } from '@/theme';
import { ProfilePage } from '@/screens/profile/page';

/** How each level reads: a status chip with an icon and words, never its color alone. */
const LEVEL: Record<CostLevel, { box: string; tone: TextTone; icon: IconName; color: ColorToken }> =
  {
    normal: { box: 'bg-primary-soft', tone: 'primary', icon: 'check', color: 'primaryText' },
    economy: { box: 'bg-warn-soft', tone: 'warn', icon: 'alert', color: 'warnIcon' },
    paused: { box: 'bg-danger-soft', tone: 'danger', icon: 'stop', color: 'danger' },
  };

const FEATURE = {
  voice_onboarding: 'costs.feature.voice_onboarding',
  voice_placement: 'costs.feature.voice_placement',
  voice_practice: 'costs.feature.voice_practice',
  placement_assessment: 'costs.feature.placement_assessment',
  partners: 'costs.feature.partners',
  report: 'costs.feature.report',
  report_check: 'costs.feature.report_check',
  memory: 'costs.feature.memory',
  tutor: 'costs.feature.tutor',
  verbatim: 'costs.feature.verbatim',
  live_corrections: 'costs.feature.live_corrections',
  retry: 'costs.feature.retry',
  card_details: 'costs.feature.card_details',
  card_audio: 'costs.feature.card_audio',
  voice_review: 'costs.feature.voice_review',
  voice_sample: 'costs.feature.voice_sample',
} as const;

// Providers go by their own names, which are not translated.
const PROVIDER: Record<string, string> = { openai: 'OpenAI', elevenlabs: 'ElevenLabs' };

// A learner without a name is told apart by this many characters of their account's id.
const ID_SHOWN = 8;

/** The first day of the month `count` months from `month` (both "2026-10-01"). */
function shiftMonth(month: string, count: number): string {
  const date = fromIsoDate(month);
  return date ? toIsoDate({ ...addMonths(date, count), day: 1 }) : month;
}

/** Every day of the month, with what was spent on it (0 for a day without spending). */
function monthDays(costs: Costs): { day: string; usd: number }[] {
  const date = fromIsoDate(costs.month);
  if (!date) return [];
  const spent = new Map(costs.days.map(({ day, usd }) => [day, usd]));
  return Array.from({ length: daysInMonth(date.year, date.month) }, (_, i) => {
    const day = toIsoDate({ ...date, day: i + 1 });
    return { day, usd: spent.get(day) ?? 0 };
  });
}

/** One row of a share-out: a name, its amount, and its part of the whole as a bar. */
function ShareRow({
  name,
  detail,
  usd,
  total,
}: {
  name: string;
  detail?: string;
  usd: number;
  total: number;
}) {
  const { i18n } = useTranslation();
  const amount = formatUsd(i18n.language, usd);
  return (
    <View className="gap-1.5 py-2">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 gap-0.5">
          <Text variant="labelMedium">{name}</Text>
          {detail ? (
            <Text variant="small" tone="muted">
              {detail}
            </Text>
          ) : null}
        </View>
        <Text variant="labelMedium">{amount}</Text>
      </View>
      <Meter share={total > 0 ? usd / total : 0} label={`${name}: ${amount}`} />
    </View>
  );
}

/** The month's total against the target and the ceiling, and what the app does about it. */
function Summary({ costs }: { costs: Costs }) {
  const { t, i18n } = useTranslation();
  const { color } = useTheme();
  const money = (usd: number) => formatUsd(i18n.language, usd);
  const look = LEVEL[costs.level];
  return (
    <Card className="gap-3 p-4">
      <Text variant="overline" tone="subtle">
        {t('costs.spent')}
      </Text>
      <Text variant="stat">{money(costs.totalUsd)}</Text>
      <Meter
        share={costs.ceilingUsd > 0 ? costs.totalUsd / costs.ceilingUsd : 0}
        label={t('costs.spoken', {
          spent: money(costs.totalUsd),
          target: money(costs.targetUsd),
        })}
      />
      <Text variant="small" tone="muted">
        {t('costs.ofTarget', {
          target: money(costs.targetUsd),
          ceiling: money(costs.ceilingUsd),
        })}
      </Text>
      <View
        className={`flex-row items-center gap-2 self-start rounded-pill px-3 py-1.5 ${look.box}`}
      >
        <Icon name={look.icon} color={color[look.color]} size={size.iconSm} />
        <Text variant="captionStrong" tone={look.tone} className="shrink">
          {t(`costs.level.${costs.level}`)}
        </Text>
      </View>
    </Card>
  );
}

/** What was spent on each day of the month; tapping a day reads out its amount. */
function Days({ costs }: { costs: Costs }) {
  const { t, i18n } = useTranslation();
  const days = monthDays(costs);
  const lastSpent = days.reduce((last, { usd }, i) => (usd > 0 ? i : last), -1);
  const [selected, setSelected] = useState<number | null>(null);
  const shown = selected ?? (lastSpent >= 0 ? lastSpent : null);
  const line = (i: number) => {
    const day = days[i];
    return day
      ? t('costs.dayValue', {
          day: formatDayOfYear(i18n.language, day.day),
          amount: formatUsd(i18n.language, day.usd),
        })
      : '';
  };
  return (
    <Card className="gap-3 p-4">
      <Text variant="labelMedium" accessibilityLiveRegion="polite">
        {shown !== null ? line(shown) : ' '}
      </Text>
      <BarChart
        dense
        bars={days.map((day, i) => ({ key: day.day, value: day.usd, label: line(i) }))}
        selected={shown}
        onSelect={setSelected}
        label={t('costs.days')}
      />
    </Card>
  );
}

function Report({ costs }: { costs: Costs }) {
  const { t } = useTranslation();
  const total = costs.totalUsd;
  const featureName = (key: string) =>
    key in FEATURE ? t(FEATURE[key as keyof typeof FEATURE]) : key;
  if (total === 0 && costs.days.length === 0) {
    return (
      <Reveal delay={staggerDelay(2)}>
        <NoticeBox icon="info">{t('costs.empty')}</NoticeBox>
      </Reveal>
    );
  }
  return (
    <>
      {costs.unpriced > 0 ? (
        <Reveal delay={staggerDelay(2)}>
          <NoticeBox icon="alert">{t('costs.unpriced', { count: costs.unpriced })}</NoticeBox>
        </Reveal>
      ) : null}
      <Reveal delay={staggerDelay(2)}>
        <Section title={t('costs.days')}>
          <Days costs={costs} />
        </Section>
      </Reveal>
      <Reveal delay={staggerDelay(3)}>
        <Section title={t('costs.features')}>
          <Card className="px-4 py-2">
            {costs.features.map((share) => (
              <ShareRow
                key={share.key}
                name={featureName(share.key)}
                usd={share.usd}
                total={total}
              />
            ))}
          </Card>
        </Section>
      </Reveal>
      <Reveal delay={staggerDelay(4)}>
        <Section title={t('costs.providers')}>
          <Card className="px-4 py-2">
            {costs.providers.map((share) => (
              <ShareRow
                key={share.key}
                name={PROVIDER[share.key] ?? share.key}
                usd={share.usd}
                total={total}
              />
            ))}
          </Card>
        </Section>
      </Reveal>
      {costs.learners.length > 0 ? (
        <Reveal delay={staggerDelay(5)}>
          <Section title={t('costs.learners')}>
            <Card className="px-4 py-2">
              {costs.learners.map((learner) => (
                <ShareRow
                  key={learner.userId}
                  name={
                    learner.name ?? t('costs.noName', { id: learner.userId.slice(0, ID_SHOWN) })
                  }
                  detail={t('costs.learnerDetail', {
                    minutes: wholeMinutes(learner.voiceSeconds),
                    requests: t('costs.requests', { count: learner.requests }),
                  })}
                  usd={learner.usd}
                  total={total}
                />
              ))}
            </Card>
          </Section>
        </Reveal>
      ) : null}
    </>
  );
}

type Loaded =
  { phase: 'loading' } | { phase: 'ready'; costs: Costs } | { phase: 'failed'; error: string };

/**
 * 6.12 Costs (spec §6.19, the owner's view): what Konvami is estimated to spend in a month,
 * against the $150 target and the $250 ceiling (decision D5), by day, feature, provider and
 * learner. Only the owner's account can read it; the server refuses anyone else.
 */
export function CostsScreen() {
  const { t, i18n } = useTranslation();
  const { costs: read } = useProfileServices();
  // Undefined: this month, as the server counts it. Later months than that cannot be opened.
  const [month, setMonth] = useState<string | undefined>(undefined);
  const [thisMonth, setThisMonth] = useState<string | null>(null);
  const [state, setState] = useState<Loaded>({ phase: 'loading' });

  // Raised to read the same month again (after a failure).
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    read(month)
      .then((costs) => {
        if (!current) return;
        setThisMonth((known) => known ?? costs.month);
        setState({ phase: 'ready', costs });
      })
      .catch((error: unknown) => {
        if (current) setState({ phase: 'failed', error: apiErrorCode(error) });
      });
    // A month left before its answer came must not replace the one now shown.
    return () => {
      current = false;
    };
  }, [read, month, attempt]);

  const shown = state.phase === 'ready' ? state.costs.month : (month ?? thisMonth);
  const go = (count: number) => () => {
    if (!shown) return;
    setState({ phase: 'loading' });
    setMonth(shiftMonth(shown, count));
  };

  return (
    <ProfilePage title={t('costs.title')} body={t('costs.body')}>
      {state.phase === 'failed' && state.error === 'not_owner' ? (
        <NoticeBox icon="lock">{t('costs.notOwner')}</NoticeBox>
      ) : (
        <>
          <Reveal delay={staggerDelay(1)}>
            <View className="min-h-tap flex-row items-center justify-between gap-2">
              <HeaderButton
                icon="chevronLeft"
                label={t('costs.previous')}
                disabled={!shown}
                onPress={go(-1)}
              />
              <Text variant="label" accessibilityRole="header" className="shrink text-center">
                {shown ? formatMonth(i18n.language, shown) : ' '}
              </Text>
              <HeaderButton
                icon="chevronRight"
                label={t('costs.next')}
                disabled={!shown || !thisMonth || shown >= thisMonth}
                onPress={go(1)}
              />
            </View>
          </Reveal>
          {state.phase === 'ready' ? (
            <>
              <Reveal delay={staggerDelay(1)}>
                <Summary costs={state.costs} />
              </Reveal>
              <Report costs={state.costs} />
            </>
          ) : (
            <LoadState
              failed={state.phase === 'failed'}
              loadingLabel={t('common.loading')}
              slowLabel={t('common.wakingUp')}
              failedLabel={t('costs.loadFailed')}
              retryLabel={t('common.retry')}
              onRetry={() => {
                setState({ phase: 'loading' });
                setAttempt((count) => count + 1);
              }}
            />
          )}
        </>
      )}
    </ProfilePage>
  );
}
