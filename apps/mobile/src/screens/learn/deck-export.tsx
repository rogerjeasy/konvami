import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/button';
import { NoticeBox } from '@/components/notice-box';
import { Text } from '@/components/text';
import { deviceLibraryMedia } from '@/offline/device-media';
import { usePracticeServices } from '@/practice/services';

/** Shares the complete authenticated deck, including cards outside the current page (§6.7). */
export function DeckExport() {
  const { t } = useTranslation();
  const { exportCards } = usePracticeServices();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  async function share() {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      const { text } = await exportCards();
      await deviceLibraryMedia.share(text, 'konvami-vocabulary', 'tsv');
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <View className="gap-2">
      <Button
        variant="secondary"
        label={t('vocabulary.export')}
        loading={busy}
        onPress={() => void share()}
      />
      <Text variant="small" tone="subtle">
        {t('vocabulary.exportHint')}
      </Text>
      {failed ? (
        <NoticeBox icon="alert" tone="danger">
          {t('vocabulary.exportFailed')}
        </NoticeBox>
      ) : null}
    </View>
  );
}
