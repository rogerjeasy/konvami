import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import type { ExamWeek, HomeExam } from '@konvami/api-client';
import { Card } from '@/components/card';
import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { useExamLabels } from '@/hooks/use-exam-labels';
import { formatDate } from '@/lib/format';
import { useTheme } from '@/theme';

/**
 * Why the week has the simulations it has: room for fewer than the pace asks, or the pace itself
 * (spec §6.12 "the plan tells you why").
 */
function usePaceLine() {
  const { t } = useTranslation();
  return ({ pace, wanted, simulations, minutes }: ExamWeek, dated: boolean) => {
    if (simulations < wanted) {
      return simulations === 0
        ? t('today.exam.noRoom', { minutes })
        : t('today.exam.someRoom', { count: simulations, minutes });
    }
    if (pace !== 'fortnightly') return t(`today.exam.pace.${pace}`);
    const off = simulations === 0;
    if (dated) return t(off ? 'today.exam.pace.fortnightlyOff' : 'today.exam.pace.fortnightly');
    return t(off ? 'today.exam.pace.fortnightlyNoDateOff' : 'today.exam.pace.fortnightlyNoDate');
  };
}

/**
 * The exam ahead and how many days are left. An exam without a date has no countdown. With a
 * speaking test the app simulates, it also says how many simulations the week plans and why,
 * which part scored lowest lately, and opens the exam centre.
 */
export function ExamCard({
  exam,
  week,
  onOpen,
}: {
  exam: HomeExam;
  /** The week's simulations; null when the exam has no speaking test in the app. */
  week: ExamWeek | null;
  onOpen: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { color } = useTheme();
  const labels = useExamLabels();
  const paceLine = usePaceLine();
  // "Goethe-Zertifikat B1"; an exam the app does not know by name is "Your exam".
  const name = [exam.name ?? t('today.exam.title'), exam.targetLevel].filter(Boolean).join(' ');
  return (
    <Card className="gap-3 p-4">
      <View className="flex-row items-center gap-3.5">
        <View
          aria-hidden
          style={{ width: size.minTapTarget, height: size.minTapTarget }}
          className="items-center justify-center rounded-field bg-primary-soft"
        >
          <Icon name="calendar" color={color.primaryText} size={size.iconMd} />
        </View>
        <View className="flex-1 gap-0.5">
          <Text variant="label">{name}</Text>
          {exam.date && exam.daysLeft !== null ? (
            <View className="flex-row flex-wrap items-baseline gap-x-2">
              <Text variant="labelSmall" tone="primary">
                {exam.daysLeft === 0
                  ? t('today.exam.today')
                  : t('today.exam.inDays', { count: exam.daysLeft })}
              </Text>
              <Text variant="small" tone="subtle">
                {formatDate(i18n.language, exam.date)}
              </Text>
            </View>
          ) : (
            <Text variant="small" tone="subtle">
              {t('today.exam.noDate')}
            </Text>
          )}
        </View>
      </View>
      {week ? (
        <View className="gap-1 border-t border-border pt-3">
          {week.simulations > 0 ? (
            <Text variant="label">
              {t('today.exam.simulations', { done: week.done, count: week.simulations })}
            </Text>
          ) : null}
          <Text variant="small" tone="muted">
            {paceLine(week, exam.date !== null)}
          </Text>
          {week.weakest ? (
            <Text variant="small" tone="muted">
              {labels.weakest(week.weakest.number - 1, week.weakest.kind)}
            </Text>
          ) : null}
          <View className="items-start">
            <TextButton tone="primary" label={t('today.exam.open')} onPress={onOpen} />
          </View>
        </View>
      ) : null}
    </Card>
  );
}
