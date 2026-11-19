import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import { useSession } from '@/auth';
import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { LoadState } from '@/components/load-state';
import { Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { OptionCard } from '@/components/option-card';
import { PageHero } from '@/components/page-hero';
import { PersonaAvatar } from '@/components/persona-avatar';
import { HeaderButton } from '@/components/step-header';
import { StepLayout } from '@/components/step-layout';
import { Text } from '@/components/text';
import { commitFeedback, stepFeedback } from '@/lib/haptics';
import { staggerDelay } from '@/lib/motion';
import { backOr } from '@/lib/navigation';
import { callRoute, ROUTES } from '@/lib/routes';
import { useHome, usePracticeServices } from '@/practice/services';
import { useTheme } from '@/theme';
import { pick } from './pick';

/**
 * 5.24 Choose two partners: a conversation with two of the learner's partners at once (persona
 * ensembles, design note 2026-11-20-two-partners). The first one picked leads (their voice runs
 * the call, they correct); the second joins in a voice of their own.
 */
export function TogetherScreen() {
  const { t } = useTranslation();
  const { status } = useSession();
  const { color } = useTheme();
  const { home: store } = usePracticeServices();
  const home = useHome();
  const [picked, setPicked] = useState<readonly string[]>([]);
  const signedIn = status === 'signedIn';

  useEffect(() => {
    if (signedIn) void store.load();
  }, [signedIn, store]);

  if (!signedIn) return <Redirect href={ROUTES.welcome} />;
  const partners = home.phase === 'ready' ? home.data.partners.map(({ persona }) => persona) : [];
  const chosen = picked.flatMap((id) => partners.filter((partner) => partner.id === id));
  const [lead, guest] = chosen;
  const ready = home.phase === 'ready';
  const enough = partners.length >= 2;

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
      actions={
        ready && enough ? (
          <Button
            label={
              lead && guest
                ? t('together.start', { first: lead.name, second: guest.name })
                : t('together.pickTwo')
            }
            disabled={!lead || !guest}
            onPress={() => {
              if (!lead || !guest) return;
              commitFeedback();
              router.push(callRoute(lead.id, { guest: guest.id }));
            }}
          />
        ) : undefined
      }
    >
      <Reveal>
        <PageHero
          color="tomato"
          icon="users"
          title={t('together.title')}
          body={t('together.body')}
        />
      </Reveal>
      {!ready ? (
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
      ) : !enough ? (
        <Reveal delay={staggerDelay(1)}>
          <View className="gap-3">
            <NoticeBox icon="info">{t('together.needTwo')}</NoticeBox>
            <Button
              variant="secondary"
              label={t('talk.newPartner')}
              leading={<Icon name="plus" color={color.fg} size={size.iconMd} />}
              onPress={() => router.push(ROUTES.accountNewPartner)}
            />
          </View>
        </Reveal>
      ) : (
        <View className="gap-3">
          <Reveal delay={staggerDelay(1)}>
            <Text tone="muted">{t('together.pickHint')}</Text>
          </Reveal>
          {partners.map((partner, i) => {
            const place = picked.indexOf(partner.id);
            return (
              <Reveal key={partner.id} delay={staggerDelay(2 + i)}>
                <OptionCard
                  role="checkbox"
                  label={partner.name}
                  description={partner.tagline ?? t(`onboarding.partners.roles.${partner.role}`)}
                  badge={
                    place === 0
                      ? t('together.leads')
                      : place === 1
                        ? t('together.joins')
                        : undefined
                  }
                  leading={<PersonaAvatar look={partner.look} />}
                  selected={place >= 0}
                  onPress={() => {
                    stepFeedback();
                    setPicked((current) => pick(current, partner.id));
                  }}
                />
              </Reveal>
            );
          })}
        </View>
      )}
    </StepLayout>
  );
}
