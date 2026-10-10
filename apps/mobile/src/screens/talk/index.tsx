import { useCallback, useEffect } from 'react';
import { View } from 'react-native';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import type { HomePartner } from '@konvami/api-client';
import { useSession } from '@/auth';
import { Badge } from '@/components/badge';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Icon } from '@/components/icon';
import { LoadState } from '@/components/load-state';
import { Reveal } from '@/components/motion';
import { PersonaAvatar } from '@/components/persona-avatar';
import { TabHeader, TabScreen } from '@/components/tab-screen';
import { Text } from '@/components/text';
import { useScreenLayout } from '@/hooks/use-screen-layout';
import { commitFeedback } from '@/lib/haptics';
import { staggerDelay } from '@/lib/motion';
import { relativeDayPhrase } from '@/lib/relative-day';
import { callRoute, ROUTES } from '@/lib/routes';
import { useHome, usePracticeServices } from '@/practice/services';
import { useTheme } from '@/theme';

// The width of a card when two share a row: half, less half of the gap between them.
const TWO_UP = '49%';

/** One partner: who they are, when the learner last talked to them, and the way to do so now. */
function PartnerCard({ partner, now }: { partner: HomePartner; now: Date }) {
  const { t, i18n } = useTranslation();
  const { color } = useTheme();
  const { persona, lastTalkedAt } = partner;
  return (
    <Card className="gap-3.5 p-4">
      <View className="flex-row items-start gap-3.5">
        <PersonaAvatar look={persona.look} diameter={size.avatarLg} />
        <View className="flex-1 gap-1">
          <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
            <Text variant="heading" className="shrink">
              {persona.name}
            </Text>
            <Badge label={t(`onboarding.partners.roles.${persona.role}`)} />
          </View>
          <Text variant="small" tone="subtle">
            {t('onboarding.partners.ageOrigin', { age: persona.age, origin: persona.origin })}
          </Text>
          <Text variant="callout" tone="muted">
            {persona.tagline ?? t(`onboarding.partners.roleLines.${persona.role}`)}
          </Text>
          <Text variant="small" tone="subtle">
            {lastTalkedAt
              ? t('talk.last', { when: relativeDayPhrase(t, i18n.language, lastTalkedAt, now) })
              : t('talk.never')}
          </Text>
        </View>
      </View>
      <Button
        variant="secondary"
        label={t('talk.start')}
        accessibilityLabel={t('talk.startLabel', { name: persona.name })}
        leading={<Icon name="mic" color={color.fg} size={size.iconMd} />}
        onPress={() => {
          commitFeedback();
          router.push(callRoute(persona.id));
        }}
      />
    </Card>
  );
}

/**
 * 5.2 Talk: the learner's partners (spec §14.1). Choosing one starts a conversation with them.
 * Creating and changing partners belongs to Persona Studio, which comes later.
 */
export function TalkScreen() {
  const { t } = useTranslation();
  const { status } = useSession();
  const { home: store, clock } = usePracticeServices();
  const home = useHome();
  const { split } = useScreenLayout();
  const signedIn = status === 'signedIn';

  useEffect(() => {
    if (signedIn) void store.load();
  }, [signedIn, store]);

  // "Last talked" goes stale like Today does.
  useFocusEffect(
    useCallback(() => {
      void store.revisit();
    }, [store]),
  );

  if (!signedIn) return <Redirect href={ROUTES.welcome} />;
  const now = new Date(clock.now());
  return (
    <TabScreen
      refreshing={home.refreshing}
      onRefresh={home.phase === 'ready' ? () => void store.refresh() : undefined}
    >
      <Reveal>
        <TabHeader title={t('talk.title')} body={t('talk.body')} />
      </Reveal>
      {home.phase === 'ready' ? (
        // Two to a row on wide windows; an odd last card keeps its width instead of stretching.
        <View className={split ? 'flex-row flex-wrap justify-between gap-y-4' : 'gap-3'}>
          {home.data.partners.map((partner, i) => (
            <Reveal
              key={partner.persona.id}
              delay={staggerDelay(i + 1)}
              style={split ? { width: TWO_UP } : undefined}
            >
              <PartnerCard partner={partner} now={now} />
            </Reveal>
          ))}
        </View>
      ) : (
        <LoadState
          failed={home.phase === 'failed'}
          loadingLabel={t('onboarding.partners.loading')}
          slowLabel={t('common.wakingUp')}
          failedLabel={t(
            home.error === 'network' ? 'errors.network' : 'onboarding.partners.loadFailed',
          )}
          retryLabel={t('common.retry')}
          onRetry={() => void store.reload()}
        />
      )}
    </TabScreen>
  );
}
