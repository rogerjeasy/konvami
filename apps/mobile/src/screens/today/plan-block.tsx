import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import type { PlanSession, WeekPlan } from '@konvami/api-client';
import { Icon, type IconName } from '@/components/icon';
import { Text } from '@/components/text';
import { useScenarioTitle, useTopicLabels } from '@/hooks/use-labels';
import { missedDays } from '@/lib/plan';
import { useTheme } from '@/theme';

// Stands between the parts of the plan's heading ("Today · 15 min · 6 cards").
const SEPARATOR = ' · ';

const KIND_ICON: Record<PlanSession['kind'], IconName> = {
  review: 'refresh',
  role_play: 'users',
  free: 'message',
};

/** One conversation of today's plan: how long, what kind, and what it works on. */
function SessionRow({ session }: { session: PlanSession }) {
  const { t } = useTranslation();
  const { color } = useTheme();
  const topics = useTopicLabels();
  const scenarioTitle = useScenarioTitle();
  const kind = t(`today.plan.kinds.${session.kind}`, {
    scenario: session.scenario ? scenarioTitle(session.scenario) : '',
  });
  const minutes = t('time.minutes', { count: session.minutes });
  const detail =
    session.kind === 'review'
      ? t('today.plan.words')
      : session.topic
        ? t('today.plan.focus', { topic: topics.name(session.topic) })
        : null;
  return (
    <View className="flex-row items-start gap-2.5">
      <View className="pt-0.5" aria-hidden>
        <Icon name={KIND_ICON[session.kind]} color={color.primaryText} size={size.icon} />
      </View>
      <View className="flex-1 gap-0.5">
        <Text variant="label" accessibilityLabel={t('today.plan.session', { minutes, kind })}>
          {`${minutes}${SEPARATOR}${kind}`}
        </Text>
        {detail ? (
          <Text variant="small" tone="muted">
            {detail}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/**
 * Today's part of the week's plan (spec §6.12 "daily card"): the conversations left for today
 * with what each works on, the cards waiting, and why today looks as it does when the plan
 * changed (days missed, voice minutes running short, the day or the week already done).
 */
export function PlanBlock({ plan }: { plan: WeekPlan }) {
  const { t, i18n } = useTranslation();
  const minutes = plan.today.reduce((sum, session) => sum + session.minutes, 0);
  const heading = [
    minutes > 0 ? t('today.plan.title', { minutes: t('time.minutes', { count: minutes }) }) : null,
    plan.todayCards > 0 ? t('today.plan.cards', { count: plan.todayCards }) : null,
  ].filter((part) => part !== null);
  const reason =
    plan.reason === 'on_track'
      ? null
      : t(`today.plan.reasons.${plan.reason}`, { days: missedDays(i18n.language, plan.missed) });
  if (!heading.length && !reason) return null;
  return (
    <View className="gap-3 border-t border-border pt-4">
      {heading.length ? (
        <Text variant="overline" tone="subtle" accessibilityRole="header">
          {heading.join(SEPARATOR)}
        </Text>
      ) : null}
      {plan.today.length ? (
        <View className="gap-3">
          {plan.today.map((session, i) => (
            <SessionRow key={`${session.kind}-${i}`} session={session} />
          ))}
        </View>
      ) : null}
      {reason ? (
        <Text variant="small" tone="muted">
          {reason}
        </Text>
      ) : null}
    </View>
  );
}
