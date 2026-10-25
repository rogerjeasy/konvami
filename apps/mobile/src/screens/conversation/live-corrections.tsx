import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { CorrectionCard } from '@/components/correction-card';
import { CorrectionChip } from '@/components/correction-chip';
import { Reveal } from '@/components/motion';
import { Sheet } from '@/components/sheet';
import { diffWords } from '@/lib/word-diff';
import type { LiveCorrection } from '@/voice/conversation';

/** The corrections of the turn corrected last, in the order they were found. */
function latest(corrections: readonly LiveCorrection[]): LiveCorrection[] {
  const turn = corrections[corrections.length - 1]?.turn;
  return corrections.filter((correction) => correction.turn === turn);
}

/** A correction's kind, as the report names it. */
function useTopic() {
  const { t } = useTranslation();
  // The server names the kind; one this app version has no name for is "Other".
  return (correction: LiveCorrection) =>
    t(`report.category.${correction.topic}` as 'report.category.other', {
      defaultValue: t('report.category.other'),
    });
}

/**
 * The mistakes found in what the learner said last (spec §6.4 correction chips), under their
 * line. They stay until the next turn with a mistake: a chip arrives a few seconds after the
 * turn, often while the partner is already answering. Tapping one opens `CorrectionSheet`.
 */
export function LiveCorrections({
  corrections,
  onOpen,
}: {
  corrections: readonly LiveCorrection[];
  onOpen: (correction: LiveCorrection) => void;
}) {
  const { t } = useTranslation();
  const shown = latest(corrections);
  if (shown.length === 0) return null;
  return (
    <View className="gap-2">
      {shown.map((correction) => {
        const { before, after } = diffWords(correction.said, correction.better);
        return (
          // A new set of chips enters as the eye expects it, under the line it is about.
          <Reveal key={`${correction.turn}:${correction.said}`}>
            <CorrectionChip
              said={before}
              better={after}
              accessibilityLabel={t('conversation.corrections.chip', {
                said: correction.said,
                better: correction.better,
              })}
              accessibilityHint={t('conversation.corrections.chipHint')}
              onPress={() => onOpen(correction)}
            />
          </Reveal>
        );
      })}
    </View>
  );
}

/**
 * Why a correction is right, in a sheet. Its state lives with the call screen, not with the
 * chips, so turning a tablet (which lays the call out anew) leaves it open. The report after the
 * call checks every mistake again.
 */
export function CorrectionSheet({
  correction,
  onClose,
}: {
  correction: LiveCorrection | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const topic = useTopic();
  const diff = correction ? diffWords(correction.said, correction.better) : null;
  return (
    <Sheet
      visible={correction !== null}
      title={t('conversation.corrections.title')}
      onClose={onClose}
    >
      {correction && diff ? (
        <View className="pt-1">
          <CorrectionCard
            topic={topic(correction)}
            saidLabel={t('report.said')}
            said={diff.before}
            betterLabel={t('report.better')}
            better={diff.after}
            explanation={correction.why}
            note={t('conversation.corrections.note')}
            accessibilityLabel={t('report.cardLabel', {
              before: correction.said,
              label: t('report.better'),
              after: correction.better,
              why: correction.why,
            })}
          />
        </View>
      ) : null}
    </Sheet>
  );
}
