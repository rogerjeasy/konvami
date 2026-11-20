import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { HalvesReportReason } from '@konvami/api-client';
import { Button } from '@/components/button';
import { ToggleRow } from '@/components/choice-group';
import { ChoiceRow, Sheet } from '@/components/sheet';
import { Text } from '@/components/text';
import { TextField } from '@/components/text-field';

export const REPORT_REASONS: HalvesReportReason[] = [
  'harassment',
  'sexual',
  'personal',
  'hate',
  'off_topic',
  'other',
];
// A report's note is a sentence or two (the server takes 300 characters).
const NOTE_MAX = 300;

/**
 * Reporting what another learner said in a game (7.10 Two Halves, 9.10 the story chain): a reason,
 * an optional note for the owner, and blocking at once. The words are the social reasons of
 * Two Halves (`halves.report.*`), the same in both games.
 */
export function ReportSheet({
  visible,
  onSend,
  onClose,
}: {
  visible: boolean;
  onSend: (reason: HalvesReportReason, note: string, block: boolean) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState<HalvesReportReason | null>(null);
  const [note, setNote] = useState('');
  const [block, setBlock] = useState(false);
  const [sending, setSending] = useState(false);
  return (
    <Sheet visible={visible} title={t('halves.report.title')} icon="flag" onClose={onClose}>
      <View className="gap-3 pt-1">
        <Text tone="muted">{t('halves.report.body')}</Text>
        {REPORT_REASONS.map((one) => (
          <ChoiceRow
            key={one}
            label={t(`halves.report.reason.${one}`)}
            selected={reason === one}
            onPress={() => setReason(one)}
          />
        ))}
        <TextField
          label={t('halves.report.note')}
          value={note}
          onChangeText={setNote}
          maxLength={NOTE_MAX}
          multiline
        />
        <ToggleRow label={t('halves.report.block')} value={block} onChange={setBlock} />
        <Button
          label={t('halves.report.send')}
          disabled={reason === null}
          loading={sending}
          onPress={() => {
            if (!reason) return;
            setSending(true);
            void onSend(reason, note.trim(), block).finally(() => setSending(false));
          }}
        />
      </View>
    </Sheet>
  );
}
