import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Celebration as Moment, QuestKind } from '@konvami/api-client';
import { Celebration } from '@/components/celebration';
import type { IconName } from '@/components/icon';
import { successFeedback } from '@/lib/haptics';
import { questWords } from '@/lib/quests';
import { useMotivation, usePracticeServices } from '@/practice/services';

/** The picture of each kind of moment; a milestone this version has no picture for gets the award. */
const QUEST_GLYPH: Record<QuestKind, IconName> = {
  talk_days: 'calendar',
  long_call: 'clock',
  review_call: 'refresh',
  role_play_goal: 'target',
  say_it_better: 'mic',
  use_word: 'book',
  pen_pal: 'send',
  quiet_partner: 'users',
  sound_drills: 'volume',
};
export const MILESTONE_GLYPH: Record<string, IconName> = {
  first_conversation: 'mic',
  five_conversations: 'message',
  long_conversation: 'clock',
  first_quest_week: 'target',
  hour_of_talking: 'volume',
  week_streak: 'flame',
  streak_repaired: 'refresh',
  hundred_words: 'book',
  first_card: 'plusCircle',
  level_up: 'barChart',
  fifty_reviews: 'check',
  month_streak: 'calendar',
};

/**
 * The moments not celebrated yet (a quest done, a milestone reached), one at a time: the oldest
 * first, with a haptic as it appears. Closing it marks it celebrated, so it is never shown twice;
 * the next one follows. Nothing shows while there is nothing new.
 */
export function Celebrations() {
  const { t } = useTranslation();
  const { celebrate } = usePracticeServices();
  const motivation = useMotivation();
  // Moments closed here: not shown again while the server's answer is on its way.
  const [closed, setClosed] = useState<ReadonlySet<string>>(new Set());
  const current: Moment | null =
    (motivation.phase === 'ready'
      ? motivation.data.celebrations.find((c) => !closed.has(`${c.kind}/${c.id}`))
      : undefined) ?? null;
  const key = current ? `${current.kind}/${current.id}` : null;

  // The haptic comes with the moment, once per moment.
  useEffect(() => {
    if (key) successFeedback();
  }, [key]);

  if (!current) return null;
  const quest = current.kind === 'quest';
  const done =
    motivation.phase === 'ready'
      ? motivation.data.quests.quests.find((q) => q.kind === current.id)
      : undefined;
  const words = questWords({ kind: current.id as QuestKind, target: done?.target ?? 1 });
  const name = quest
    ? t(words.key, { count: words.count })
    : t(`progress.milestones.names.${current.id}` as 'progress.milestones.title', {
        defaultValue: current.id,
      });
  const close = () => {
    setClosed((before) => new Set(before).add(`${current.kind}/${current.id}`));
    void celebrate({ kind: current.kind, id: current.id });
  };
  return (
    <Celebration
      key={key}
      visible
      title={t(quest ? 'motivation.celebrate.quest' : 'motivation.celebrate.milestone')}
      name={name}
      glyph={
        (quest ? QUEST_GLYPH[current.id as QuestKind] : MILESTONE_GLYPH[current.id]) ?? 'award'
      }
      closeLabel={t('motivation.celebrate.close')}
      onClose={close}
    />
  );
}
