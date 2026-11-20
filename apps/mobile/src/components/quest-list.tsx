import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import type { Quest } from '@konvami/api-client';
import { Icon } from '@/components/icon';
import { Meter } from '@/components/meter';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { useTileInk, useTileTone } from '@/components/tile';
import { questWords } from '@/lib/quests';
import { useTheme } from '@/theme';

/** One quest: what to say, how far it is, and the way to do it while it is open. */
function QuestRow({ quest, onStart }: { quest: Quest; onStart?: () => void }) {
  const { t } = useTranslation();
  const { color } = useTheme();
  const tone = useTileTone();
  const ink = color[useTileInk()?.ink ?? 'fg'];
  const words = questWords(quest);
  const name = t(words.key, { count: words.count });
  const state = quest.done
    ? t('motivation.quests.done')
    : t('motivation.quests.progress', { progress: quest.progress, target: quest.target });
  return (
    <View className="gap-1.5">
      <View className="flex-row items-start gap-2.5">
        {quest.done ? (
          <View aria-hidden className="pt-0.5">
            <Icon name="check" color={ink} size={size.iconMd} />
          </View>
        ) : null}
        <Text variant="label" tone={tone} className="flex-1">
          {name}
        </Text>
        <Text variant="captionStrong" tone={tone}>
          {state}
        </Text>
      </View>
      {quest.done ? null : (
        <View className="gap-1">
          <Meter
            share={quest.progress / quest.target}
            label={t('common.stepCounter', { current: quest.progress, total: quest.target })}
          />
          {onStart ? (
            <View className="items-start">
              <TextButton label={t('motivation.quests.go')} onPress={onStart} />
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}

/**
 * The week's quests, each with its progress; a quest still open offers the way to do it when
 * `onStart` is given. Laid on the butter block (the week is butter) or on a card.
 */
export function QuestList({
  quests,
  onStart,
}: {
  quests: readonly Quest[];
  onStart?: (quest: Quest) => void;
}) {
  return (
    <View className="gap-3.5">
      {quests.map((quest) => (
        <QuestRow
          key={quest.kind}
          quest={quest}
          onStart={onStart ? () => onStart(quest) : undefined}
        />
      ))}
    </View>
  );
}
