import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/button';
import { TextField } from '@/components/text-field';
import { TextButton } from '@/components/text-button';
import { usePracticeServices } from '@/practice/services';
import { apiErrorCode } from '@/api/messages';
import { commitFeedback } from '@/lib/haptics';

// Match the phrasebook API's bounds; the form grows inside the screen's scroll area.
const PHRASE_LIMIT = 200;
const MEANING_LIMIT = 300;

export function ManualPhrase({ onFailed }: { onFailed: (code: string) => void }) {
  const { t } = useTranslation();
  const { keepPhrase } = usePracticeServices();
  const [open, setOpen] = useState(false);
  const [phrase, setPhrase] = useState('');
  const [meaning, setMeaning] = useState('');
  const [group, setGroup] = useState('');
  const [busy, setBusy] = useState(false);
  async function save() {
    if (busy || !phrase.trim() || !meaning.trim()) return;
    setBusy(true);
    try {
      await keepPhrase({
        phrase: phrase.trim(),
        meaning: meaning.trim(),
        situation: group.trim() || null,
      });
      commitFeedback();
      setPhrase('');
      setMeaning('');
      setGroup('');
      setOpen(false);
    } catch (error) {
      onFailed(apiErrorCode(error));
    } finally {
      setBusy(false);
    }
  }
  return open ? (
    <View className="gap-3">
      <TextField
        label={t('phrasebook.manualPhrase')}
        value={phrase}
        onChangeText={setPhrase}
        maxLength={PHRASE_LIMIT}
      />
      <TextField
        label={t('phrasebook.manualMeaning')}
        value={meaning}
        onChangeText={setMeaning}
        maxLength={MEANING_LIMIT}
      />
      <TextField
        label={t('phrasebook.group')}
        value={group}
        onChangeText={setGroup}
        maxLength={PHRASE_LIMIT}
      />
      <Button
        label={t('phrasebook.manualSave')}
        loading={busy}
        disabled={!phrase.trim() || !meaning.trim()}
        onPress={() => void save()}
      />
      <TextButton label={t('common.close')} disabled={busy} onPress={() => setOpen(false)} />
    </View>
  ) : (
    <TextButton label={t('phrasebook.manualAdd')} onPress={() => setOpen(true)} />
  );
}
