import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Phrase } from '@konvami/api-client';
import { apiErrorCode } from '@/api/messages';
import { Badge } from '@/components/badge';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { commitFeedback } from '@/lib/haptics';
import { usePracticeServices } from '@/practice/services';

/**
 * A phrase the learner keeps: it, its meaning, what it was kept for, and what can be done with
 * it: make it a flashcard (once), or remove it.
 */
export function PhraseCard({
  phrase,
  onFailed,
}: {
  phrase: Phrase;
  /** Called with the failure's code when a request did not complete. */
  onFailed: (code: string) => void;
}) {
  const { t } = useTranslation();
  const { makePhraseCard, removePhrase } = usePracticeServices();
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<unknown>) {
    commitFeedback();
    setBusy(true);
    try {
      await action();
    } catch (error) {
      onFailed(apiErrorCode(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="gap-3 p-4">
      <View className="gap-1">
        <Text variant="labelMedium">{phrase.phrase}</Text>
        <Text variant="small" tone="muted">
          {phrase.meaning}
        </Text>
        {phrase.situation ? (
          <Text variant="caption" tone="subtle">
            {phrase.situation}
          </Text>
        ) : null}
      </View>
      <View className="gap-1">
        {phrase.inDeck ? (
          <View className="flex-row">
            <Badge label={t('phrasebook.inCards')} tone="surface" />
          </View>
        ) : (
          <Button
            variant="secondary"
            label={t('phrasebook.makeCard')}
            accessibilityLabel={t('phrasebook.makeCardLabel', { phrase: phrase.phrase })}
            loading={busy}
            onPress={() => void run(() => makePhraseCard(phrase.id))}
          />
        )}
        <View className="items-center">
          <TextButton
            label={t('phrasebook.remove')}
            accessibilityLabel={t('phrasebook.removeLabel', { phrase: phrase.phrase })}
            disabled={busy}
            onPress={() => void run(() => removePhrase(phrase.id))}
          />
        </View>
      </View>
    </Card>
  );
}
