import { useState } from 'react';
import { View } from 'react-native';
import { Button } from '@/components/button';
import { ToggleRow } from '@/components/choice-group';
import { ChoiceRow, Sheet } from '@/components/sheet';
import { Text } from '@/components/text';
import { TextField } from '@/components/text-field';

// A report's note is a sentence or two (the server takes 300 characters).
export const REPORT_NOTE_MAX = 300;

/**
 * Reporting something another learner said (a Two Halves move, a call on Radio Konvami): a reason
 * from a fixed list, an optional note for the owner, and, where it applies, blocking at once.
 * The strings come from the screen, so the sheet stays the same in every feature.
 */
export function ReportSheet<Reason extends string>({
  visible,
  title,
  body,
  reasons,
  reasonLabel,
  noteLabel,
  sendLabel,
  blockLabel,
  onSend,
  onClose,
}: {
  visible: boolean;
  title: string;
  body: string;
  reasons: readonly Reason[];
  reasonLabel: (reason: Reason) => string;
  noteLabel: string;
  sendLabel: string;
  /** Offers blocking the other learner with the report; none: no such switch. */
  blockLabel?: string;
  onSend: (reason: Reason, note: string, block: boolean) => Promise<void>;
  onClose: () => void;
}) {
  const [reason, setReason] = useState<Reason | null>(null);
  const [note, setNote] = useState('');
  const [block, setBlock] = useState(false);
  const [sending, setSending] = useState(false);
  return (
    <Sheet visible={visible} title={title} icon="flag" onClose={onClose}>
      <View className="gap-3 pt-1">
        <Text tone="muted">{body}</Text>
        {reasons.map((one) => (
          <ChoiceRow
            key={one}
            label={reasonLabel(one)}
            selected={reason === one}
            onPress={() => setReason(one)}
          />
        ))}
        <TextField
          label={noteLabel}
          value={note}
          onChangeText={setNote}
          maxLength={REPORT_NOTE_MAX}
          multiline
        />
        {blockLabel ? <ToggleRow label={blockLabel} value={block} onChange={setBlock} /> : null}
        <Button
          label={sendLabel}
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
