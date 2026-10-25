import { useTranslation } from 'react-i18next';
import type { GrammarMastery, GrammarTopic } from '@konvami/api-client';

/**
 * How the grammar screens name a topic and its state. The server sends ids; one this version of
 * the app has no name for shows as its id, as written.
 */
export function useTopicLabels() {
  const { t } = useTranslation();
  return {
    name: (id: string) =>
      t(`grammar.topics.${id}` as 'grammar.topics.dative', { defaultValue: id }),
    mastery: (state: GrammarMastery) => t(`grammar.mastery.${state}`),
    /** How often it was right ("5 of 10 right"). */
    right: (topic: Pick<GrammarTopic, 'uses' | 'correct'>) =>
      t('grammar.right', { correct: topic.correct, uses: topic.uses }),
  };
}
