import { useTranslation } from 'react-i18next';
import type { Scenario } from '@konvami/api-client';
import { ProgressChips } from '@/components/progress-chips';

/** A role-play's goals, each ticked off when the partner says the learner reached it. */
export function Goals({ scenario, reached }: { scenario: Scenario; reached: readonly string[] }) {
  const { t } = useTranslation();
  return (
    <ProgressChips
      items={scenario.goals.map((goal) => {
        const done = reached.includes(goal);
        const label = t(`scenarios.${scenario.id}.goals.${goal}` as 'scenarios.bakery.goals.order');
        return {
          key: goal,
          label,
          done,
          accessibilityLabel: t(
            done ? 'conversation.goals.chipDone' : 'conversation.goals.chipOpen',
            { goal: label },
          ),
        };
      })}
    />
  );
}
