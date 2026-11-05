import { ActivityIndicator, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { PenPalCorrection, PenPalNote } from '@konvami/api-client';
import { CorrectionCard } from '@/components/correction-card';
import { NoticeBox } from '@/components/notice-box';
import { PlayButton, type PlayState } from '@/components/play-button';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { formatClock } from '@/lib/format';
import { diffWords } from '@/lib/word-diff';
import { useTheme } from '@/theme';

// How long a voice note plays, as far as the app can tell without opening the file: spoken
// German runs at about 13 characters a second. It only bounds how long the clip player waits for
// an end it never reports, so it errs on the long side.
const MS_PER_CHARACTER = 120;
const MIN_NOTE_MS = 5000;

/** The longest a note's sound can be taken to play, from its text. */
export function noteMilliseconds(text: string): number {
  return Math.max(MIN_NOTE_MS, text.length * MS_PER_CHARACTER);
}

/**
 * One note of a thread, as a chat bubble. A partner's note sits left and plays (its text under
 * it, to read along); the learner's own sits right, with what they said written down word for
 * word. A note the partner is still recording says so; one that did not come through offers
 * another try.
 */
export function NoteBubble({
  note,
  name,
  playing,
  onPlay,
  onRetry,
  retryLimit,
}: {
  note: PenPalNote;
  /** The partner's name. */
  name: string;
  playing: PlayState;
  onPlay: () => void;
  onRetry: () => void;
  /** Trying again was refused: it was tried three times. */
  retryLimit: boolean;
}) {
  const { t, i18n } = useTranslation();
  const { color } = useTheme();
  const mine = note.sender === 'learner';
  const answer = note.replyTo !== null;

  if (note.status === 'pending') {
    return (
      <View
        accessibilityLiveRegion="polite"
        className="max-w-[88%] flex-row items-center gap-3 self-start rounded-card rounded-bl-sm border border-border bg-chip px-3.5 py-3"
      >
        <ActivityIndicator color={color.primary} />
        <Text tone="muted" className="shrink">
          {t(answer ? 'penPal.writingReply' : 'penPal.writingNote', { name })}
        </Text>
      </View>
    );
  }
  if (note.status === 'failed') {
    return (
      <View className="max-w-[88%] gap-1 self-start">
        <NoticeBox icon="alert" tone="danger">
          {t(retryLimit ? 'penPal.retryLimit' : 'penPal.noteFailed')}
        </NoticeBox>
        {retryLimit ? null : (
          <View className="items-start">
            <TextButton tone="primary" label={t('penPal.retry')} onPress={onRetry} />
          </View>
        )}
      </View>
    );
  }

  const who = mine ? t('penPal.yourNote') : t('penPal.noteFrom', { name });
  return (
    <View
      className={`max-w-[88%] gap-2 rounded-card px-3.5 py-3 ${
        mine
          ? 'self-end rounded-br-sm border border-primary bg-primary-soft'
          : 'self-start rounded-bl-sm border border-border bg-chip'
      }`}
    >
      <View className="flex-row items-center gap-3">
        {note.audioUrl ? (
          <PlayButton
            label={t(playing === 'playing' ? 'penPal.stopPlaying' : 'penPal.play')}
            state={playing}
            onPress={onPlay}
          />
        ) : null}
        <View className="shrink gap-0.5">
          <Text variant="captionStrong" tone={mine ? 'primary' : 'muted'}>
            {mine ? t('penPal.yourNote') : name}
          </Text>
          <Text variant="caption" tone="subtle">
            {formatClock(i18n.language, note.createdAt)}
          </Text>
        </View>
      </View>
      <Text variant="chat" accessibilityLabel={`${who}. ${note.text}`}>
        {note.text}
      </Text>
    </View>
  );
}

/**
 * The corrections that came with a partner's answer, as the report shows them: what the learner
 * said and how it is better said. One the second check could not confirm is marked "Not sure"
 * and is a hint, never a fact (spec §16.1).
 */
export function Corrections({ corrections }: { corrections: readonly PenPalCorrection[] }) {
  const { t } = useTranslation();
  if (corrections.length === 0) return null;
  return (
    <View className="w-full gap-2.5">
      {corrections.map((correction, i) => {
        const { before, after } = diffWords(correction.original, correction.corrected);
        return (
          <CorrectionCard
            key={i}
            // The server names the kind; one this app version has no name for is "Other".
            topic={t(`report.category.${correction.category}` as 'report.category.other', {
              defaultValue: t('report.category.other'),
            })}
            badge={correction.certain ? undefined : t('report.polish.unsure')}
            saidLabel={t('report.said')}
            said={before}
            betterLabel={t('report.better')}
            better={after}
            explanation={correction.explanation}
            note={correction.certain ? undefined : t('report.polish.unsureNote')}
            accessibilityLabel={t('report.cardLabel', {
              before: correction.original,
              label: t('report.better'),
              after: correction.corrected,
              why: correction.explanation,
            })}
          />
        );
      })}
    </View>
  );
}
