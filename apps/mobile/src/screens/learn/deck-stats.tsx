import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text, type TextTone } from '@/components/text';

/**
 * The deck in three numbers: every card, the ones due now (tomato, the colour of acting now), and
 * the ones waiting for their day. All three come from the deck's own summary.
 */
export function DeckStats({ total, due }: { total: number; due: number }) {
  const { t } = useTranslation();
  const stats: { key: 'total' | 'due' | 'waiting'; value: number; tone: TextTone }[] = [
    { key: 'total', value: total, tone: 'fg' },
    { key: 'due', value: due, tone: 'tomato' },
    { key: 'waiting', value: Math.max(0, total - due), tone: 'fg' },
  ];
  return (
    <View className="flex-row flex-wrap gap-2.5">
      {stats.map((stat) => (
        <View
          key={stat.key}
          accessible
          accessibilityLabel={`${stat.value} ${t(`learn.stats.${stat.key}`)}`}
          className="min-w-[28%] flex-1 rounded-card border border-border bg-chip px-3.5 py-3"
        >
          <Text variant="stat" tone={stat.tone}>
            {stat.value}
          </Text>
          <Text variant="small" tone="subtle">
            {t(`learn.stats.${stat.key}`)}
          </Text>
        </View>
      ))}
    </View>
  );
}
