import { useState } from 'react';
import { View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { Persona, Scenario } from '@konvami/api-client';
import { useSession } from '@/auth';
import { Button } from '@/components/button';
import { ChoiceChip } from '@/components/choice-chip';
import { ChoiceGroup } from '@/components/choice-group';
import { Icon } from '@/components/icon';
import { ListGroup, ListRow } from '@/components/list';
import { LoadState } from '@/components/load-state';
import { Reveal } from '@/components/motion';
import { Sheet } from '@/components/sheet';
import { HeaderButton } from '@/components/step-header';
import { StepLayout } from '@/components/step-layout';
import { Text } from '@/components/text';
import { commitFeedback } from '@/lib/haptics';
import { staggerDelay } from '@/lib/motion';
import { backOr } from '@/lib/navigation';
import { callRoute, ROUTES } from '@/lib/routes';
import { useHome, useScenarios } from '@/practice/services';
import { useTheme } from '@/theme';
import { size } from '@konvami/design-tokens';

/** A scenario's own strings, by its id (the app names role-plays; the server knows their ids). */
const titleKey = (scenario: Scenario) =>
  `scenarios.${scenario.id}.title` as 'scenarios.bakery.title';

/**
 * One role-play before it starts: the situation, the goals, and which partner plays the other
 * person. Starting closes the sheet and opens the call.
 */
function ScenarioSheet({
  scenario,
  partners,
  onClose,
}: {
  scenario: Scenario | null;
  partners: readonly Persona[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { color } = useTheme();
  const [chosen, setChosen] = useState<string | null>(null);
  const partnerId = chosen ?? partners[0]?.id ?? null;
  return (
    <Sheet
      visible={scenario !== null}
      title={scenario ? t(titleKey(scenario)) : ''}
      onClose={() => {
        setChosen(null);
        onClose();
      }}
    >
      {scenario ? (
        <View className="gap-5 pt-1">
          <Text tone="muted">
            {t(`scenarios.${scenario.id}.situation` as 'scenarios.bakery.situation')}
          </Text>
          <View className="gap-2">
            <Text variant="labelMedium">{t('rolePlays.goals')}</Text>
            {scenario.goals.map((goal) => (
              <View key={goal} className="flex-row items-start gap-2.5">
                <Icon name="target" color={color.primaryText} size={size.iconMd} />
                <Text className="flex-1">
                  {t(`scenarios.${scenario.id}.goals.${goal}` as 'scenarios.bakery.goals.order')}
                </Text>
              </View>
            ))}
          </View>
          <ChoiceGroup label={t('rolePlays.who')} chips>
            {partners.map((partner) => (
              <ChoiceChip
                key={partner.id}
                label={partner.name}
                selected={partner.id === partnerId}
                onPress={() => setChosen(partner.id)}
              />
            ))}
          </ChoiceGroup>
          <Button
            label={t('rolePlays.start')}
            disabled={partnerId === null}
            onPress={() => {
              if (partnerId === null) return;
              commitFeedback();
              setChosen(null);
              onClose();
              router.push(callRoute(partnerId, { scenario: scenario.id }));
            }}
          />
        </View>
      ) : null}
    </Sheet>
  );
}

/**
 * 5.13 Role-plays (spec §6.3): the real-life situations of the language learned, easiest first,
 * each with its level. One opens with its goals and a choice of partner, and starts as a call
 * in which the partner plays the other person.
 */
export function RolePlaysScreen() {
  const { t } = useTranslation();
  const { status } = useSession();
  const reading = useScenarios();
  const home = useHome();
  const [open, setOpen] = useState<Scenario | null>(null);

  if (status !== 'signedIn') return <Redirect href={ROUTES.welcome} />;
  const partners = home.phase === 'ready' ? home.data.partners.map(({ persona }) => persona) : [];
  return (
    <StepLayout
      header={
        <View className="min-h-tap flex-row items-center">
          <HeaderButton
            icon="chevronLeft"
            label={t('common.back')}
            onPress={() => backOr(ROUTES.talk)}
          />
        </View>
      }
    >
      <Reveal>
        <View className="gap-1.5">
          <Text variant="title" accessibilityRole="header">
            {t('rolePlays.title')}
          </Text>
          <Text tone="muted">{t('rolePlays.body')}</Text>
        </View>
      </Reveal>
      {reading.phase === 'ready' && reading.scenarios ? (
        <Reveal delay={staggerDelay(1)}>
          <ListGroup>
            {reading.scenarios.map((scenario) => (
              <ListRow
                key={scenario.id}
                icon="users"
                title={t(titleKey(scenario))}
                badge={scenario.level}
                detail={t(`scenarios.${scenario.id}.situation` as 'scenarios.bakery.situation')}
                accessibilityLabel={t('rolePlays.scenarioLabel', {
                  title: t(titleKey(scenario)),
                  level: scenario.level,
                })}
                onPress={() => setOpen(scenario)}
              />
            ))}
          </ListGroup>
        </Reveal>
      ) : (
        <LoadState
          failed={reading.phase === 'failed'}
          loadingLabel={t('rolePlays.loading')}
          slowLabel={t('common.wakingUp')}
          failedLabel={t('rolePlays.loadFailed')}
          retryLabel={t('common.retry')}
          onRetry={reading.retry}
        />
      )}
      <ScenarioSheet scenario={open} partners={partners} onClose={() => setOpen(null)} />
    </StepLayout>
  );
}
