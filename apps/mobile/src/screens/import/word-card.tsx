import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { CourseImport } from '@konvami/api-client';
import { apiErrorCode } from '@/api/messages';
import { Badge } from '@/components/badge';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Text } from '@/components/text';
import { commitFeedback } from '@/lib/haptics';
import { usePracticeServices } from '@/practice/services';

/** A word of an import with its meaning, and the button that saves it as a flashcard (once). */
export function ImportWordCard({
  importId,
  index,
  word,
  onSaved,
  onFailed,
}: {
  importId: string;
  /** The word's place in the import, from 0. */
  index: number;
  word: CourseImport['vocabulary'][number];
  /** Called once the card is made, so the screen can show it. */
  onSaved: () => void;
  /** Called with the failure's code when the card could not be made. */
  onFailed: (code: string) => void;
}) {
  const { t } = useTranslation();
  const { makeImportCard } = usePracticeServices();
  const [busy, setBusy] = useState(false);

  async function save() {
    commitFeedback();
    setBusy(true);
    try {
      await makeImportCard(importId, index);
      onSaved();
    } catch (error) {
      onFailed(apiErrorCode(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="gap-3 p-4">
      <View className="gap-1">
        <Text variant="labelMedium">{word.word}</Text>
        <Text variant="small" tone="muted">
          {word.meaning}
        </Text>
      </View>
      {word.inDeck ? (
        <View className="flex-row">
          <Badge label={t('import.result.saved')} tone="surface" />
        </View>
      ) : (
        <Button
          variant="secondary"
          label={t('import.result.save')}
          accessibilityLabel={t('import.result.saveLabel', { word: word.word })}
          loading={busy}
          onPress={() => void save()}
        />
      )}
    </Card>
  );
}
