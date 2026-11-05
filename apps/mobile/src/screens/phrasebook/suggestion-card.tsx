import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { PhraseSuggestion } from '@konvami/api-client';
import { Badge } from '@/components/badge';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Text } from '@/components/text';

/** A phrase the phrasebook suggests, with its meaning, and the button that keeps it. */
export function SuggestionCard({
  suggestion,
  onKeep,
}: {
  suggestion: PhraseSuggestion;
  onKeep: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Card className="gap-3 p-4">
      <View className="gap-1">
        <Text variant="labelMedium">{suggestion.phrase}</Text>
        <Text variant="small" tone="muted">
          {suggestion.meaning}
        </Text>
      </View>
      {suggestion.saved ? (
        <View className="flex-row">
          <Badge label={t('phrasebook.kept')} tone="surface" />
        </View>
      ) : (
        <Button
          variant="secondary"
          label={t('phrasebook.keep')}
          accessibilityLabel={t('phrasebook.keepLabel', { phrase: suggestion.phrase })}
          onPress={onKeep}
        />
      )}
    </Card>
  );
}
