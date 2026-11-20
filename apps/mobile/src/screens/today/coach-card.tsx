import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { Coach } from '@konvami/api-client';
import { Section } from '@/components/section';
import { TextButton } from '@/components/text-button';
import { ROUTES } from '@/lib/routes';
import { SuggestionCard } from '@/screens/coach/suggestion-card';

/**
 * The Coach on Today (5.1): its first open suggestion, with the way to 5.26. When the Coach
 * leads (an exam close with no recent simulation), it comes before the week's plan and its
 * "Start" is the main action; otherwise it follows the plan quietly. Nothing to suggest: no card.
 */
export function CoachCard({ coach }: { coach: Coach }) {
  const { t } = useTranslation();
  const first = coach.suggestions.find((suggestion) => suggestion.status === 'open');
  if (!first) return null;
  return (
    <Section
      title={t('coach.todayTitle')}
      action={
        <TextButton
          tone="primary"
          label={t('coach.all')}
          onPress={() => router.push(ROUTES.coach)}
        />
      }
    >
      <SuggestionCard suggestion={first} main={coach.leads} />
    </Section>
  );
}
