import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import type { HomeExam } from '@konvami/api-client';
import { Card } from '@/components/card';
import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import { formatDate } from '@/lib/format';
import { useTheme } from '@/theme';

/** The exam ahead and how many days are left. An exam without a date has no countdown. */
export function ExamCard({ exam }: { exam: HomeExam }) {
  const { t, i18n } = useTranslation();
  const { color } = useTheme();
  // "Goethe-Zertifikat B1"; an exam the app does not know by name is "Your exam".
  const name = [exam.name ?? t('today.exam.title'), exam.targetLevel].filter(Boolean).join(' ');
  return (
    <Card className="flex-row items-center gap-3.5 p-4">
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
    </Card>
  );
}
