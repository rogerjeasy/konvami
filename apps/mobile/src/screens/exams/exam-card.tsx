import { View } from 'react-native';
import type { ExamCard as Card } from '@konvami/api-client';
import { Text } from '@/components/text';

/**
 * A part's prompt card, as the exam prints it: in the language of the exam, its task and the
 * points to cover. `heading` names the part in the learner's own language.
 */
export function ExamCard({ heading, card }: { heading: string; card: Card }) {
  return (
    <View className="gap-2 rounded-card border border-border bg-surface p-4">
      <Text variant="overline" tone="subtle" accessibilityRole="header">
        {heading}
      </Text>
      <Text variant="heading">{card.title}</Text>
      <View className="gap-1">
        {card.prompts.map((prompt) => (
          <View key={prompt} className="flex-row items-start gap-2">
            <Text variant="callout" tone="primary" aria-hidden>
              •
            </Text>
            <Text variant="callout" className="flex-1">
              {prompt}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
