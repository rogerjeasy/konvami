import { useTranslation } from 'react-i18next';
import { useProfileServices } from '@/profile/services';
import type { ConversationState, ForgetNote } from '@/voice/conversation';
import { SettingsToast } from './settings-toast';
import { UndoToast } from './undo-toast';

/**
 * Tells the learner that the partner forgot something on their word (spec §6.11 "forget that"),
 * with Undo while the call goes on. When the call ends it is final: what it hid is deleted.
 */
export function ForgetToast({ forgets }: { forgets: readonly ForgetNote[] }) {
  const { t } = useTranslation();
  const { memory } = useProfileServices();
  const latest = forgets[forgets.length - 1];
  if (!latest) return null;
  return (
    <UndoToast
      id={`forget-${latest.forget}`}
      done={t('conversation.forget.done', { count: latest.notes })}
      restored={t('conversation.forget.restored')}
      failed={t('conversation.forget.failed')}
      undoLabel={t('conversation.forget.undoLabel')}
      undo={() => memory.undoForget(latest.forget)}
    />
  );
}

/** The one note with Undo the call shows: the latest of a changed setting and a forget. */
export function CallNotice({
  conversation,
}: {
  conversation: Pick<ConversationState, 'profileChanges' | 'forgets' | 'lastNotice'>;
}) {
  return conversation.lastNotice === 'forget' ? (
    <ForgetToast forgets={conversation.forgets} />
  ) : (
    <SettingsToast changes={conversation.profileChanges} />
  );
}
