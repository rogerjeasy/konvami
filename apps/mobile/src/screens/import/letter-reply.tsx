import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/button';
import { Text } from '@/components/text';
import { TextField } from '@/components/text-field';
import { usePracticeServices } from '@/practice/services';

export function LetterReply({ id }: { id: string }) {
  const { t } = useTranslation();
  const { draftImportReply } = usePracticeServices();
  const [reply, setReply] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  async function draft() {
    setBusy(true);
    setFailed(false);
    try {
      setReply(await draftImportReply(id));
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <View className="gap-3">
      {reply === null ? (
        <Button label={t('import.draftReply')} loading={busy} onPress={() => void draft()} />
      ) : (
        <>
          <Text tone="muted">{t('import.draftNote')}</Text>
          <TextField
            multiline
            label={t('import.replyText')}
            value={reply}
            onChangeText={setReply}
          />
        </>
      )}
      {failed ? <Text accessibilityLiveRegion="polite">{t('import.failed')}</Text> : null}
    </View>
  );
}
