import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import { Card } from '@/components/card';
import { Icon } from '@/components/icon';
import { Reveal } from '@/components/motion';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { commitFeedback } from '@/lib/haptics';
import { useTheme } from '@/theme';

type Phase = 'shown' | 'undoing' | 'restored' | 'failed';

export interface UndoToastProps {
  /** What the note is about; a new id starts afresh. */
  id: string;
  /** What happened, what came back after Undo, and what to say when it could not be undone. */
  done: string;
  restored: string;
  failed: string;
  /** The button's accessible name, saying what it undoes. */
  undoLabel: string;
  undo: () => Promise<void>;
}

/**
 * A note during the call that something was done on the learner's word, with Undo: a setting the
 * partner changed (`SettingsToast`), something it forgot (`ForgetToast`).
 */
export function UndoToast({ id, done, restored, failed, undoLabel, undo }: UndoToastProps) {
  const { t } = useTranslation();
  const { color } = useTheme();
  // What became of the undo is kept with the note it is about: a newer note starts afresh.
  const [attempt, setAttempt] = useState<{ id: string; phase: Phase } | null>(null);
  const phase: Phase = attempt?.id === id ? attempt.phase : 'shown';

  async function press() {
    commitFeedback();
    setAttempt({ id, phase: 'undoing' });
    try {
      await undo();
      setAttempt({ id, phase: 'restored' });
    } catch {
      setAttempt({ id, phase: 'failed' });
    }
  }

  const text = phase === 'restored' ? restored : phase === 'failed' ? failed : done;
  return (
    <Reveal key={id}>
      <Card className="flex-row items-center gap-3 px-4 py-2">
        <Icon name="check" color={color.primaryText} size={size.iconMd} />
        <View className="flex-1" accessibilityLiveRegion="polite">
          <Text variant="small">{text}</Text>
        </View>
        {phase === 'shown' || phase === 'undoing' ? (
          <TextButton
            tone="primary"
            label={t('conversation.settings.undo')}
            accessibilityLabel={undoLabel}
            disabled={phase === 'undoing'}
            onPress={() => void press()}
          />
        ) : null}
      </Card>
    </Reveal>
  );
}
