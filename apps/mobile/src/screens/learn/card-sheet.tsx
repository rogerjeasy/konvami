import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Card } from '@konvami/api-client';
import { NoticeBox } from '@/components/notice-box';
import { ActionRow, Sheet } from '@/components/sheet';
import { Text } from '@/components/text';
import { ArticleWord, WordForms } from '@/components/word-forms';
import { commitFeedback } from '@/lib/haptics';
import { usePracticeServices } from '@/practice/services';
import { dueLabel } from './due-label';
import { Listen } from './listen';

// Stands between the facts about a card ("Word · Reviewed 3 times · Tomorrow").
const SEPARATOR = ' · ';

/**
 * One card in full, in a sheet: both sides, where a word came from or why a correction is
 * right, a word's forms (its article in its gender's colour), its sound in the learner's
 * partner's voice, how often it was reviewed and when it is due. The card can be removed from here.
 */
export function CardSheet({ card, onClose }: { card: Card | null; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const { deck, clock } = usePracticeServices();
  const [failed, setFailed] = useState(false);

  const close = () => {
    setFailed(false);
    onClose();
  };
  async function remove(id: string) {
    commitFeedback();
    setFailed(false);
    try {
      await deck.remove(id);
      close();
    } catch {
      setFailed(true);
    }
  }

  if (!card) return null;
  const correction = card.kind === 'correction';
  const facts = [
    t(`learn.kind.${card.kind}`),
    card.reviews > 0 ? t('learn.card.reviews', { count: card.reviews }) : t('learn.card.fresh'),
    dueLabel(t, i18n.language, card.dueAt, new Date(clock.now()), true),
  ];
  return (
    <Sheet visible title={t(`learn.kind.${card.kind}`)} onClose={close}>
      <View testID="card-sheet" className="gap-4 pb-1 pt-2">
        {correction ? (
          <View className="gap-3">
            <View className="gap-1">
              <Text variant="caption" tone="subtle">
                {t('learn.card.said')}
              </Text>
              <Text variant="callout" tone="muted">
                {card.front}
              </Text>
            </View>
            <View className="gap-1">
              <Text variant="caption" tone="subtle">
                {t('learn.card.better')}
              </Text>
              <Text variant="emphasis">{card.back}</Text>
            </View>
            {card.note ? (
              <Text variant="small" tone="muted">
                {card.note}
              </Text>
            ) : null}
          </View>
        ) : (
          <View className="gap-3">
            <ArticleWord
              text={card.front}
              article={card.details?.article ?? null}
              variant="heading"
              header
            />
            <View className="gap-1.5">
              <Text variant="emphasis">{card.back}</Text>
              {card.note ? (
                <Text variant="small" tone="subtle" className="italic">
                  {card.note}
                </Text>
              ) : null}
            </View>
            {card.details ? <WordForms details={card.details} /> : null}
          </View>
        )}
        <Listen cardId={card.id} />
        <Text variant="caption" tone="subtle">
          {facts.join(SEPARATOR)}
        </Text>
        {failed ? (
          <NoticeBox icon="alert" tone="danger">
            {t('learn.card.removeFailed')}
          </NoticeBox>
        ) : null}
        <ActionRow
          icon="trash"
          label={t('learn.card.remove')}
          danger
          onPress={() => void remove(card.id)}
        />
      </View>
    </Sheet>
  );
}
