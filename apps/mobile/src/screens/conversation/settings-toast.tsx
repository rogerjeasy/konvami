import { useTranslation } from 'react-i18next';
import { settingName } from '@/profile/changes';
import { useProfileServices } from '@/profile/services';
import type { ProfileChangeNote } from '@/voice/conversation';
import { UndoToast } from './undo-toast';

/**
 * Tells the learner that the partner changed a setting on their word, with Undo (spec §12.7:
 * "Explanation language changed · Undo"). The latest change is the one shown, because only the
 * latest change of a setting can be undone. Undoing puts the setting back for the next
 * conversation; the partner goes on as asked for the rest of this one. The Profile lists every
 * change made by voice, so a toast that was missed can still be undone there.
 */
export function SettingsToast({ changes }: { changes: readonly ProfileChangeNote[] }) {
  const { t } = useTranslation();
  const { changes: store } = useProfileServices();
  const latest = changes[changes.length - 1];
  if (!latest) return null;
  const setting = settingName(latest.field, t);
  return (
    <UndoToast
      id={`change-${latest.change}`}
      done={t('conversation.settings.changed', { setting })}
      restored={t('conversation.settings.restored', { setting })}
      failed={t('conversation.settings.failed')}
      undoLabel={t('conversation.settings.undoLabel', { setting })}
      undo={() => store.undo(latest.change)}
    />
  );
}
