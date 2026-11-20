import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import type { Milestone } from '@konvami/api-client';
import { Card } from '@/components/card';
import { Icon, type IconName } from '@/components/icon';
import { Meter } from '@/components/meter';
import { Pop } from '@/components/motion';
import { Section } from '@/components/section';
import { Text } from '@/components/text';
import { staggerDelay } from '@/lib/motion';
import { formatDate } from '@/lib/format';
import { MILESTONE_GLYPH } from '@/screens/quests/celebrations';
import { useTheme, type ColorToken } from '@/theme';

// Four badges to a row, as on the v4 prototype (a share of the row, before the gaps).
const BADGE_BASIS = '21%';
// The glyph inside a badge (pt).
const BADGE_GLYPH = 28;
// The calendar day of a stored moment ("2026-10-09T12:00:00Z" → "2026-10-09").
const DAY_LENGTH = 'YYYY-MM-DD'.length;

/**
 * The colour blocks a reached badge takes, in turn (class names spelled out for Tailwind).
 * Each block keeps its own text colour for the glyph.
 */
const BLOCKS: readonly { box: string; ink: ColorToken }[] = [
  { box: 'bg-tomato', ink: 'onTomato' },
  { box: 'bg-butter', ink: 'onButter' },
  { box: 'bg-pink', ink: 'onPink' },
  { box: 'bg-forest', ink: 'lime' },
  { box: 'bg-inverse', ink: 'onInverse' },
];

/** What a milestone stands for, drawn on its badge. Unknown ids get the award. */
const GLYPH: Record<string, IconName> = MILESTONE_GLYPH;

/** One milestone's name and state, as the app and a screen reader say them. */
function useMilestoneWords(milestone: Milestone) {
  const { t, i18n } = useTranslation();
  // A milestone this app version has no name for is shown by its id rather than left out.
  const name = t(`progress.milestones.names.${milestone.id}` as 'progress.milestones.title', {
    defaultValue: milestone.id,
  });
  const state = milestone.reached
    ? milestone.reachedAt
      ? t('progress.milestones.reachedOn', {
          date: formatDate(i18n.language, milestone.reachedAt.slice(0, DAY_LENGTH)),
        })
      : t('progress.milestones.reached')
    : t('common.stepCounter', { current: milestone.current, total: milestone.target });
  return { name, state, label: t('progress.milestones.label', { name, state }) };
}

/** One badge: a coloured block once reached, a dashed outline with a lock before. */
function Badge({
  milestone,
  order,
  selected,
  onPress,
}: {
  milestone: Milestone;
  order: number;
  selected: boolean;
  onPress: () => void;
}) {
  const { color } = useTheme();
  const { label } = useMilestoneWords(milestone);
  const block = BLOCKS[order % BLOCKS.length] ?? BLOCKS[0]!;
  const reached = milestone.reached;
  const face = (
    <View
      className={`flex-1 items-center justify-center rounded-card border-2 ${
        reached
          ? `${block.box} ${selected ? 'border-fg' : 'border-transparent'}`
          : `border-dashed ${selected ? 'border-fg' : 'border-border'}`
      }`}
    >
      <Icon
        name={reached ? (GLYPH[milestone.id] ?? 'award') : 'lock'}
        color={reached ? color[block.ink] : color.fgSubtle}
        size={reached ? BADGE_GLYPH : size.iconLg}
      />
    </View>
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{ flexBasis: BADGE_BASIS, aspectRatio: 1, minHeight: size.minTapTarget }}
      className="grow active:opacity-pressed"
    >
      {/* What was reached pops in, one after the other; what is ahead simply stands there. */}
      {reached ? (
        <Pop delay={staggerDelay(order)} style={{ flex: 1 }}>
          {face}
        </Pop>
      ) : (
        face
      )}
    </Pressable>
  );
}

/** The chosen badge in words: its name, reached or how far along, with a bar until it is. */
function Detail({ milestone }: { milestone: Milestone }) {
  const { name, state } = useMilestoneWords(milestone);
  return (
    <Card className="gap-1.5 p-3.5" aria-hidden>
      <View className="flex-row flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <Text variant="label" className="shrink">
          {name}
        </Text>
        <Text variant="caption" tone={milestone.reached ? 'success' : 'subtle'}>
          {state}
        </Text>
      </View>
      {milestone.reached ? null : (
        <Meter share={milestone.current / milestone.target} label={state} />
      )}
    </Card>
  );
}

/**
 * The milestones as a grid of badges, in the order a learner usually passes them; tapping one
 * names it under the grid (the next one to reach is named first). Each marks something said,
 * kept or come back to: there are no points and no leagues (spec §6.15).
 */
export function Milestones({ milestones }: { milestones: readonly Milestone[] }) {
  const { t } = useTranslation();
  const next = milestones.findIndex((milestone) => !milestone.reached);
  const [chosen, setChosen] = useState(next >= 0 ? next : milestones.length - 1);
  const reached = milestones.filter((milestone) => milestone.reached).length;
  const shown = milestones[chosen];
  return (
    <Section
      title={t('progress.milestones.title')}
      action={
        <Text variant="labelSmall" tone="subtle">
          {t('common.stepCounter', { current: reached, total: milestones.length })}
        </Text>
      }
    >
      <View className="gap-3">
        <View className="flex-row flex-wrap gap-2.5">
          {milestones.map((milestone, i) => (
            <Badge
              key={milestone.id}
              milestone={milestone}
              order={i}
              selected={i === chosen}
              onPress={() => setChosen(i)}
            />
          ))}
        </View>
        {shown ? <Detail milestone={shown} /> : null}
      </View>
    </Section>
  );
}
