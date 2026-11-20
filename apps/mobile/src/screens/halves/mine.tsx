import { View } from 'react-native';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/auth';
import { Card } from '@/components/card';
import { LoadState } from '@/components/load-state';
import { Reveal } from '@/components/motion';
import { PageHero } from '@/components/page-hero';
import { HeaderButton } from '@/components/step-header';
import { StepLayout } from '@/components/step-layout';
import { Text } from '@/components/text';
import { useHalvesCase } from '@/halves/services';
import { staggerDelay } from '@/lib/motion';
import { backOr } from '@/lib/navigation';
import { halvesCaseRoute, ROUTES } from '@/lib/routes';

/**
 * 7.9 One of the learner's own moves, privately: what they said and the corrections their partner
 * confirmed. The other player heard the move and never sees this.
 */
export function HalvesMineScreen() {
  const { t } = useTranslation();
  const { status } = useSession();
  const signedIn = status === 'signedIn';
  const { id, move } = useLocalSearchParams<{ id: string; move: string }>();
  const { state, refresh } = useHalvesCase(signedIn ? (id ?? null) : null);

  if (!signedIn) return <Redirect href={ROUTES.welcome} />;
  const found = state.phase === 'ready' ? state.data : null;
  const mine = found?.rounds.find((round) => round.mine?.id === move)?.mine ?? null;
  return (
    <StepLayout
      header={
        <View className="min-h-tap flex-row items-center">
          <HeaderButton
            icon="chevronLeft"
            label={t('common.back')}
            onPress={() => backOr(id ? halvesCaseRoute(id) : ROUTES.halves)}
          />
        </View>
      }
    >
      {!found ? (
        <LoadState
          failed={state.phase === 'failed'}
          loadingLabel={t('halves.case.loading')}
          slowLabel={t('common.wakingUp')}
          failedLabel={t('halves.case.loadFailed')}
          retryLabel={t('common.retry')}
          onRetry={refresh}
        />
      ) : !mine ? (
        <Text tone="muted">{t('halves.case.loadFailed')}</Text>
      ) : (
        <>
          <Reveal>
            <PageHero
              color="tomato"
              icon="lock"
              title={t('halves.mine.title')}
              body={t('halves.mine.body', { name: found.partner.name })}
            />
          </Reveal>
          <Reveal delay={staggerDelay(1)}>
            <Card className="gap-2 p-4">
              <Text variant="labelSmall" tone="muted">
                {t('halves.mine.said')}
              </Text>
              <Text variant="langLine">{mine.transcript}</Text>
            </Card>
          </Reveal>
          <Reveal delay={staggerDelay(2)}>
            <View className="gap-2.5">
              <Text variant="section" accessibilityRole="header">
                {t('halves.mine.corrections')}
              </Text>
              {mine.corrections.length === 0 ? (
                <Text tone="muted">{t('halves.mine.none')}</Text>
              ) : (
                mine.corrections.map((correction) => (
                  <Card key={correction.original} className="gap-1.5 p-4">
                    <Text variant="langLine" tone="warn">
                      {correction.original}
                    </Text>
                    <Text variant="langLine">{correction.corrected}</Text>
                    <Text variant="small" tone="muted">
                      {correction.explanation}
                    </Text>
                    {!correction.certain ? (
                      <Text variant="caption" tone="subtle">
                        {t('halves.mine.unsure')}
                      </Text>
                    ) : null}
                  </Card>
                ))
              )}
            </View>
          </Reveal>
        </>
      )}
    </StepLayout>
  );
}
