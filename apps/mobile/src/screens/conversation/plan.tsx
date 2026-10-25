import { useMemo } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { CallPlan } from '@konvami/api-client';
import { ProgressChips } from '@/components/progress-chips';
import { Text } from '@/components/text';
import { formatList } from '@/lib/format';
import { usesWord } from '@/lib/word-use';

/** The plan's words the learner has used so far in the call. */
function useWordsUsed(plan: CallPlan, said: readonly string[]): ReadonlySet<string> {
  return useMemo(
    () =>
      new Set(
        plan.words
          .filter(({ text }) => said.some((line) => usesWord(text, line, plan.language)))
          .map(({ text }) => text),
      ),
    [plan, said],
  );
}

/**
 * What the conversation sets out to practise (the Session Planner, spec §8.2): the kinds of
 * mistake the partner steers towards, and the learner's saved words, each ticked off once they
 * have used it (spec §6.4 "3 of 5 target words used"). Nothing to plan, nothing shown.
 */
export function CallPlanStrip({
  plan,
  learnerLines,
}: {
  plan: CallPlan;
  /** Everything the learner said in the call so far. */
  learnerLines: readonly string[];
}) {
  const { t, i18n } = useTranslation();
  const used = useWordsUsed(plan, learnerLines);
  if (plan.focus.length === 0 && plan.words.length === 0) return null;
  const topics = plan.focus.map((topic) =>
    t(`report.category.${topic}` as 'report.category.other', {
      defaultValue: t('report.category.other'),
    }),
  );
  return (
    <View className="items-center gap-2 pt-1">
      {topics.length ? (
        <Text variant="caption" tone="subtle" className="text-center">
          {t('conversation.plan.focus', { topics: formatList(i18n.language, topics) })}
        </Text>
      ) : null}
      {plan.words.length ? (
        <>
          <Text variant="caption" tone="subtle" className="text-center">
            {t('conversation.plan.words', { used: used.size, count: plan.words.length })}
          </Text>
          <ProgressChips
            items={plan.words.map(({ text }) => {
              const done = used.has(text);
              return {
                key: text,
                label: text,
                done,
                accessibilityLabel: t(
                  done ? 'conversation.plan.wordDone' : 'conversation.plan.wordOpen',
                  { word: text },
                ),
              };
            })}
          />
        </>
      ) : null}
    </View>
  );
}
