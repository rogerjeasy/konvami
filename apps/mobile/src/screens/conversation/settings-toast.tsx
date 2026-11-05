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
import { settingName } from '@/profile/changes';
import { useProfileServices } from '@/profile/services';
import { useTheme } from '@/theme';
import type { ProfileChangeNote } from '@/voice/conversation';

type Phase = 'shown' | 'undoing' | 'restored' | 'failed';

/**
 * Tells the learner that the partner changed a setting on their word, with Undo (spec §12.7:
 * "Explanation language changed · Undo"). The latest change is the one shown, because only the
 * latest change of a setting can be undone. Undoing puts the setting back for the next
 * conversation; the partner goes on as asked for the rest of this one. The Profile lists every
 * change made by voice, so a toast that was missed can still be undone there.
 */
export function SettingsToast({ changes }: { changes: readonly ProfileChangeNote[] }) {
  const { t } = useTranslation();
  const { color } = useTheme();
  const { changes: store } = useProfileServices();
  const latest = changes[changes.length - 1];
  // What became of the undo is kept with the change it is about: a newer change starts afresh.
  const [attempt, setAttempt] = useState<{ change: number; phase: Phase } | null>(null);

  if (!latest) return null;
  const setting = settingName(latest.field, t);
  const phase: Phase = attempt?.change === latest.change ? attempt.phase : 'shown';

  async function undo(change: number) {
    commitFeedback();
    setAttempt({ change, phase: 'undoing' });
    try {
      await store.undo(change);
      setAttempt({ change, phase: 'restored' });
    } catch {
      setAttempt({ change, phase: 'failed' });
    }
  }

  const text =
    phase === 'restored'
      ? t('conversation.settings.restored', { setting })
      : phase === 'failed'
        ? t('conversation.settings.failed')
        : t('conversation.settings.changed', { setting });
  return (
    <Reveal key={latest.change}>
      <Card className="flex-row items-center gap-3 px-4 py-2">
        <Icon name="check" color={color.primaryText} size={size.iconMd} />
        <View className="flex-1" accessibilityLiveRegion="polite">
          <Text variant="small">{text}</Text>
        </View>
        {phase === 'shown' || phase === 'undoing' ? (
          <TextButton
            tone="primary"
            label={t('conversation.settings.undo')}
            accessibilityLabel={t('conversation.settings.undoLabel', { setting })}
            disabled={phase === 'undoing'}
            onPress={() => void undo(latest.change)}
          />
        ) : null}
      </Card>
    </Reveal>
  );
}
