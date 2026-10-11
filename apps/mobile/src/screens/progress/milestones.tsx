import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import type { Milestone } from '@konvami/api-client';
import { Icon } from '@/components/icon';
import { ListGroup } from '@/components/list';
import { Meter } from '@/components/meter';
import { Pop } from '@/components/motion';
import { Section } from '@/components/section';
import { Text } from '@/components/text';
import { staggerDelay } from '@/lib/motion';
import { useTheme } from '@/theme';

/** One milestone: reached, with its mark filled in, or how far along the learner is. */
function MilestoneRow({ milestone, order }: { milestone: Milestone; order: number }) {
  const { t } = useTranslation();
  const { color } = useTheme();
  // A milestone this app version has no name for is shown by its id rather than left out.
  const name = t(`progress.milestones.names.${milestone.id}` as 'progress.milestones.title', {
    defaultValue: milestone.id,
  });
  const state = milestone.reached
    ? t('progress.milestones.reached')
    : t('common.stepCounter', { current: milestone.current, total: milestone.target });
  const mark = (
    <View
      style={{ width: size.avatarSm, height: size.avatarSm }}
      className={`items-center justify-center rounded-pill ${milestone.reached ? 'bg-primary' : 'bg-track'}`}
    >
      <Icon
        name="award"
        color={milestone.reached ? color.onPrimary : color.fgSubtle}
        size={size.iconMd}
      />
    </View>
  );
  return (
    <View
      accessible
      accessibilityLabel={t('progress.milestones.label', { name, state })}
      className="flex-row items-center gap-3 p-3.5"
    >
      {/* What was reached pops in, one after the other; what is ahead simply stands there. */}
      {milestone.reached ? <Pop delay={staggerDelay(order)}>{mark}</Pop> : mark}
      <View className="flex-1 gap-1.5">
        <View className="flex-row flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <Text variant="label" className="shrink">
            {name}
          </Text>
          <Text variant="caption" tone={milestone.reached ? 'success' : 'subtle'}>
            {state}
          </Text>
        </View>
        {milestone.reached ? null : (
          <View aria-hidden>
            <Meter share={milestone.current / milestone.target} label={state} />
          </View>
        )}
      </View>
    </View>
  );
}

/**
 * The milestones, in the order a learner usually passes them. Each marks something said, kept
 * or come back to: there are no points and no leagues (spec §6.15).
 */
export function Milestones({ milestones }: { milestones: readonly Milestone[] }) {
  const { t } = useTranslation();
  return (
    <Section title={t('progress.milestones.title')}>
      <ListGroup>
        {milestones.map((milestone, i) => (
          <MilestoneRow key={milestone.id} milestone={milestone} order={i} />
        ))}
      </ListGroup>
    </Section>
  );
}
