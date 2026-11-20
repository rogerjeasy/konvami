import { useEffect } from 'react';
import { View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import { useSession } from '@/auth';
import { Button } from '@/components/button';
import { Icon, type IconName } from '@/components/icon';
import { LoadState } from '@/components/load-state';
import { Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { PageHero } from '@/components/page-hero';
import { HeaderButton } from '@/components/step-header';
import { StepLayout } from '@/components/step-layout';
import { Text } from '@/components/text';
import { commitFeedback } from '@/lib/haptics';
import { staggerDelay } from '@/lib/motion';
import { backOr } from '@/lib/navigation';
import { drillCallRoute, ROUTES } from '@/lib/routes';
import { useHome, usePracticeServices, useSuggestedPartner } from '@/practice/services';
import { useTheme } from '@/theme';

// How the drill goes, in three steps, each with its icon.
const STEPS: readonly { key: 'how1' | 'how2' | 'how3'; icon: IconName }[] = [
  { key: 'how1', icon: 'mic' },
  { key: 'how2', icon: 'refresh' },
  { key: 'how3', icon: 'volume' },
];

/**
 * 5.30 Commute drill (gap 17 of the 2026-11-20 research): a ten-minute call that needs no
 * screen, for walking or travelling. The partner Today suggests runs rounds of prompt, answer
 * and recast over the learner's due words and the sentences their reports corrected; the call
 * starts in walking mode where the phone has it. Reached from Learn.
 */
export function DrillScreen() {
  const { t } = useTranslation();
  const { color } = useTheme();
  const { status } = useSession();
  const { home: store } = usePracticeServices();
  const home = useHome();
  const partnerId = useSuggestedPartner();
  const signedIn = status === 'signedIn';

  useEffect(() => {
    if (signedIn) void store.load();
  }, [signedIn, store]);

  if (!signedIn) return <Redirect href={ROUTES.welcome} />;
  const partner =
    home.phase === 'ready'
      ? home.data.partners.find(({ persona }) => persona.id === partnerId)?.persona
      : undefined;
  return (
    <StepLayout
      header={
        <View className="min-h-tap flex-row items-center">
          <HeaderButton
            icon="chevronLeft"
            label={t('common.back')}
            onPress={() => backOr(ROUTES.learn)}
          />
        </View>
      }
      actions={
        partner ? (
          <View className="gap-2">
            <Button
              label={t('drill.start')}
              leading={<Icon name="mic" color={color.onPrimary} size={size.iconMd} />}
              onPress={() => {
                commitFeedback();
                router.push(drillCallRoute(partner.id));
              }}
            />
            <Text variant="small" tone="subtle" className="text-center">
              {t('drill.partner', { name: partner.name })}
            </Text>
          </View>
        ) : undefined
      }
    >
      <Reveal>
        <PageHero color="tomato" icon="compass" title={t('drill.title')} body={t('drill.body')} />
      </Reveal>
      {home.phase !== 'ready' ? (
        <LoadState
          failed={home.phase === 'failed'}
          loadingLabel={t('call.status.connecting')}
          slowLabel={t('common.wakingUp')}
          failedLabel={t(home.error === 'network' ? 'errors.network' : 'drill.noPartner')}
          retryLabel={t('common.retry')}
          onRetry={() => void store.reload()}
        />
      ) : (
        <View className="gap-3">
          {STEPS.map((step, i) => (
            <Reveal key={step.key} delay={staggerDelay(i + 1)}>
              <View className="flex-row items-start gap-3">
                <View
                  aria-hidden
                  className="h-10 w-10 items-center justify-center rounded-field bg-tomato"
                >
                  <Icon name={step.icon} color={color.onTomato} size={size.iconMd} />
                </View>
                <Text className="flex-1">{t(`drill.${step.key}`)}</Text>
              </View>
            </Reveal>
          ))}
          {!partner ? <NoticeBox icon="info">{t('drill.noPartner')}</NoticeBox> : null}
        </View>
      )}
    </StepLayout>
  );
}
