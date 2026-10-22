import { useCallback, useEffect } from 'react';
import { View } from 'react-native';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import type { HomePartner } from '@konvami/api-client';
import { useSession } from '@/auth';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Icon } from '@/components/icon';
import { LoadState } from '@/components/load-state';
import { Reveal } from '@/components/motion';
import { PersonaSummary } from '@/components/persona-summary';
import { TabHeader, TabScreen } from '@/components/tab-screen';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { useScreenLayout } from '@/hooks/use-screen-layout';
import { commitFeedback } from '@/lib/haptics';
import { staggerDelay } from '@/lib/motion';
import { relativeDayPhrase } from '@/lib/relative-day';
import { callRoute, ROUTES } from '@/lib/routes';
import { useHome, usePracticeServices } from '@/practice/services';
import { useTheme } from '@/theme';
import { ListGroup, ListRow } from '@/components/list';

// The width of a card when two share a row: half, less half of the gap between them.
const TWO_UP = '49%';

/** One partner: who they are, when the learner last talked to them, and the way to do so now. */
function PartnerCard({ partner, now }: { partner: HomePartner; now: Date }) {
  const { t, i18n } = useTranslation();
  const { color } = useTheme();
  const { persona, lastTalkedAt } = partner;
  return (
    <Card className="gap-3.5 p-4">
      <PersonaSummary persona={persona}>
        <Text variant="small" tone="subtle">
          {lastTalkedAt
            ? t('talk.last', { when: relativeDayPhrase(t, i18n.language, lastTalkedAt, now) })
            : t('talk.never')}
        </Text>
      </PersonaSummary>
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
 * 5.2 Talk: the learner's partners (spec §14.1). Choosing one starts a conversation with them;
 * the buttons under them lead to Persona Studio (6.4–6.6), where partners are made and changed.
 */
export function TalkScreen() {
  const { t } = useTranslation();
  const { status } = useSession();
  const { home: store, clock } = usePracticeServices();
  const home = useHome();
  const { split } = useScreenLayout();
  const { color } = useTheme();
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
      <Reveal delay={staggerDelay(1)}>
        <ListGroup>
          <ListRow
            icon="users"
            title={t('rolePlays.row')}
            detail={t('rolePlays.rowHint')}
            onPress={() => router.push(ROUTES.rolePlays)}
          />
        </ListGroup>
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
          <Reveal
            delay={staggerDelay(home.data.partners.length + 1)}
            style={split ? { width: '100%' } : undefined}
          >
            <View className="gap-1 pt-2">
              <Button
                variant="secondary"
                label={t('talk.newPartner')}
                leading={<Icon name="plus" color={color.fg} size={size.iconMd} />}
                onPress={() => router.push(ROUTES.accountNewPartner)}
              />
              <TextButton
                label={t('talk.manage')}
                onPress={() => router.push(ROUTES.accountPartners)}
              />
            </View>
          </Reveal>
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
