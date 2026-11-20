import { useTranslation } from 'react-i18next';
import { ProgressChips } from '@/components/progress-chips';
import type { RolePlayGoal } from '@/hooks/use-role-plays';

/** A role-play's goals, each ticked off when the partner says the learner reached it. */
export function Goals({
  goals,
  reached,
}: {
  goals: readonly RolePlayGoal[];
  reached: readonly string[];
}) {
  const { t } = useTranslation();
  return (
    <ProgressChips
      items={goals.map((goal) => {
        const done = reached.includes(goal.id);
        return {
          key: goal.id,
          label: goal.label,
          done,
          accessibilityLabel: t(
            done ? 'conversation.goals.chipDone' : 'conversation.goals.chipOpen',
            { goal: goal.label },
          ),
        };
      })}
    />
  );
}
