import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { IconButton } from '@/components/icon-button';
import { ActionRow, Sheet } from '@/components/sheet';

/**
 * What can be done with one line of a transcript, behind one round button beside it: highlight
 * its words while it plays, bookmark it, write a note. One button per line keeps the
 * conversation readable; the sheet names each action in full.
 */
export function TurnMenu({
  title,
  highlight,
  bookmarked,
  onBookmark,
  onNote,
}: {
  /** The sheet's title: who said the line. */
  title: string;
  /** Highlighting, for a recorded line; `disabled` once the recording proved to have no timing. */
  highlight: { label: string; disabled: boolean; onPress: () => void } | null;
  /** Whether the line is bookmarked; null without the device's library tools. */
  bookmarked: boolean | null;
  onBookmark: () => void;
  onNote: (() => void) | null;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  if (!highlight && bookmarked === null && !onNote) return null;
  // Each action closes the sheet first, so a note editor or the highlight can take over.
  const then = (action: () => void) => () => {
    setOpen(false);
    action();
  };
  return (
    <>
      <IconButton icon="more" label={t('offlineLibrary.more')} onPress={() => setOpen(true)} />
      <Sheet visible={open} title={title} onClose={() => setOpen(false)}>
        <View className="gap-1">
          {highlight ? (
            <ActionRow
              icon="eye"
              label={highlight.label}
              disabled={highlight.disabled}
              onPress={then(highlight.onPress)}
            />
          ) : null}
          {bookmarked === null ? null : (
            <ActionRow
              icon="book"
              label={t(bookmarked ? 'offlineLibrary.unbookmark' : 'offlineLibrary.bookmark')}
              onPress={then(onBookmark)}
            />
          )}
          {onNote ? (
            <ActionRow icon="edit" label={t('offlineLibrary.editNote')} onPress={then(onNote)} />
          ) : null}
        </View>
      </Sheet>
    </>
  );
}
