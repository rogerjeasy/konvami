import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import Constants from 'expo-constants';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import type { Home } from '@konvami/api-client';
import { useAuthServices, useSession } from '@/auth';
import { Badge } from '@/components/badge';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Icon } from '@/components/icon';
import { ListGroup, ListRow } from '@/components/list';
import { Reveal } from '@/components/motion';
import { Section } from '@/components/section';
import { HeaderButton } from '@/components/step-header';
import { TabScreen } from '@/components/tab-screen';
import { Text } from '@/components/text';
import { UserPhoto } from '@/components/user-photo';
import { useScreenLayout } from '@/hooks/use-screen-layout';
import { isLanguage } from '@/i18n';
import { wholeMinutes } from '@/lib/format';
import { staggerDelay } from '@/lib/motion';
import { backOr } from '@/lib/navigation';
import { ROUTES } from '@/lib/routes';
import { useHome, usePracticeServices } from '@/practice/services';
import { useAccount } from '@/profile/services';
import { useTheme } from '@/theme';

// The share of a wide window the learner's card takes; the lists get the rest.
const SIDE_COLUMN = '38%';

/** One number about the learner's practice. Read as one phrase ("Day streak: 4"). */
function Stat({ label, value }: { label: string; value: string }) {
  const { t } = useTranslation();
  return (
    <View
      accessible
      accessibilityLabel={t('profile.stats.spoken', { label, value })}
      className="flex-1 items-center gap-0.5 rounded-card border border-border bg-chip px-2 py-3"
    >
      <Text variant="stat" aria-hidden>
        {value}
      </Text>
      <Text variant="caption" tone="subtle" aria-hidden className="text-center">
        {label}
      </Text>
    </View>
  );
}

/** Who the learner is, what they are learning and how much they have practised. */
function Identity({ home }: { home: Home | null }) {
  const { t, i18n } = useTranslation();
  const { color } = useTheme();
  const { user } = useSession();
  const { pictureUrl } = useAccount();
  const name = user?.firstName ?? '';
  const number = (value: number) => new Intl.NumberFormat(i18n.language).format(value);
  // The languages Konvami teaches have a name in every app language; another one goes by its code.
  const language = home
    ? isLanguage(home.language)
      ? t(`onboarding.languagesInText.${home.language}`)
      : home.language.toUpperCase()
    : null;

  return (
    <View className="gap-3">
      <Card className="items-center gap-3 p-5">
        <UserPhoto uri={pictureUrl} name={name} diameter={size.avatarHero} />
        <View className="items-center gap-1">
          <Text variant="heading" className="text-center">
            {name || t('profile.noName')}
          </Text>
          {user?.email ? (
            <Text variant="small" tone="muted" className="text-center">
              {user.email}
            </Text>
          ) : null}
        </View>
        {language ? (
          <View className="flex-row flex-wrap items-center justify-center gap-x-2 gap-y-1.5">
            <View className="flex-row items-center gap-1.5 rounded-pill bg-primary-soft px-2.5 py-1">
              <Icon name="globe" color={color.primaryText} size={size.iconSm} />
              <Text variant="captionStrong" tone="primary">
                {t('profile.learning', { language })}
              </Text>
            </View>
            {home?.level ? (
              <View className="flex-row items-center gap-1.5 rounded-pill bg-surface px-2.5 py-1">
                <Text variant="captionStrong">{home.level.level}</Text>
                {home.level.source === 'measured' ? (
                  <Badge tone="chip" label={t('onboarding.source.measured')} />
                ) : null}
              </View>
            ) : null}
          </View>
        ) : null}
      </Card>
      {home ? (
        <View className="flex-row gap-2">
          <Stat label={t('profile.stats.streak')} value={number(home.activity.streakDays)} />
          <Stat
            label={t('profile.stats.conversations')}
            value={number(home.activity.conversations)}
          />
          <Stat
            label={t('profile.stats.minutes')}
            value={number(wholeMinutes(home.activity.seconds))}
          />
        </View>
      ) : null}
    </View>
  );
}

/**
 * 6.1 Profile (spec §14.1): who is signed in, and the way to everything about them: their
 * name and photo, what they are learning, their partners and what those know about them,
 * their privacy choices and the security of the account. Every number comes from their own practice.
 */
export function ProfileScreen() {
  const { t } = useTranslation();
  const { color } = useTheme();
  const { session } = useAuthServices();
  const { status } = useSession();
  const { home: store } = usePracticeServices();
  const home = useHome();
  const { split } = useScreenLayout();
  const [leaving, setLeaving] = useState(false);
  const signedIn = status === 'signedIn';

  useEffect(() => {
    if (signedIn) void store.load();
  }, [signedIn, store]);

  // The streak and the partners change elsewhere; coming back reads them again when stale.
  useFocusEffect(
    useCallback(() => {
      void store.revisit();
    }, [store]),
  );

  // While signing out, the screen stays as it is until Welcome replaces it.
  if (!signedIn && !leaving) return <Redirect href={ROUTES.welcome} />;

  const data = home.phase === 'ready' ? home.data : null;
  const go = (route: Parameters<typeof router.push>[0]) => () => router.push(route);

  const lists = (
    <View className="gap-6">
      <Reveal delay={staggerDelay(1)}>
        <Section title={t('profile.groups.you')}>
          <ListGroup>
            <ListRow
              icon="user"
              title={t('profile.rows.personal')}
              detail={t('profile.rows.personalHint')}
              onPress={go(ROUTES.accountPersonal)}
            />
            <ListRow
              icon="target"
              title={t('profile.rows.learning')}
              detail={t('profile.rows.learningHint')}
              onPress={go(ROUTES.accountLearning)}
            />
          </ListGroup>
        </Section>
      </Reveal>
      <Reveal delay={staggerDelay(2)}>
        <Section title={t('profile.groups.partners')}>
          <ListGroup>
            <ListRow
              icon="users"
              title={t('profile.rows.partners')}
              value={
                data ? t('profile.rows.partnersCount', { count: data.partners.length }) : undefined
              }
              onPress={go(ROUTES.accountPartners)}
            />
            <ListRow
              icon="plusCircle"
              title={t('profile.rows.newPartner')}
              detail={t('profile.rows.newPartnerHint')}
              onPress={go(ROUTES.accountNewPartner)}
            />
            <ListRow
              icon="file"
              title={t('profile.rows.memory')}
              detail={t('profile.rows.memoryHint')}
              onPress={go(ROUTES.accountMemory)}
            />
          </ListGroup>
        </Section>
      </Reveal>
      <Reveal delay={staggerDelay(3)}>
        <Section title={t('profile.groups.privacy')}>
          <ListGroup>
            <ListRow
              icon="shield"
              title={t('profile.rows.privacy')}
              detail={t('profile.rows.privacyHint')}
              onPress={go(ROUTES.accountPrivacy)}
            />
            <ListRow
              icon="lock"
              title={t('profile.rows.security')}
              detail={t('profile.rows.securityHint')}
              onPress={go(ROUTES.accountSecurity)}
            />
          </ListGroup>
        </Section>
      </Reveal>
      <Reveal delay={staggerDelay(4)}>
        <View className="gap-3">
          <Button
            variant="secondary"
            label={t('common.signOut')}
            leading={<Icon name="logOut" color={color.fg} size={size.iconMd} />}
            loading={leaving}
            onPress={async () => {
              setLeaving(true);
              await session.signOut();
              router.replace(ROUTES.welcome);
            }}
          />
          <Text variant="caption" tone="subtle" className="text-center">
            {t('profile.version', { version: Constants.expoConfig?.version ?? '' })}
          </Text>
        </View>
      </Reveal>
    </View>
  );

  return (
    <TabScreen>
      <Reveal>
        <View className="gap-4">
          <View className="min-h-tap flex-row items-center">
            <HeaderButton
              icon="chevronLeft"
              label={t('common.back')}
              onPress={() => backOr(ROUTES.today)}
            />
          </View>
          <Text variant="title" accessibilityRole="header">
            {t('profile.title')}
          </Text>
        </View>
      </Reveal>
      {split ? (
        <View className="flex-row items-start gap-8">
          <Reveal style={{ width: SIDE_COLUMN }}>
            <Identity home={data} />
          </Reveal>
          <View className="flex-1">{lists}</View>
        </View>
      ) : (
        <>
          <Reveal>
            <Identity home={data} />
          </Reveal>
          {lists}
        </>
      )}
    </TabScreen>
  );
}
