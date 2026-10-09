import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import { routeForSession, useAuthServices, useSession } from '@/auth';
import { Wordmark } from '@/components/brand';
import { Button } from '@/components/button';
import { HeroLayout } from '@/components/hero-layout';
import { Icon } from '@/components/icon';
import { Link } from '@/components/link';
import { Pop, Reveal } from '@/components/motion';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { availableBiometrics, confirmWithBiometrics, type BiometricKind } from '@/lib/biometrics';
import { commitFeedback } from '@/lib/haptics';
import { staggerDelay } from '@/lib/motion';
import { ROUTES } from '@/lib/routes';
import { useTheme } from '@/theme';
import { useAccessDraft } from './draft';

// Sizes (pt) as on the design: the wordmark, and the initial on its disc inside a ring.
const WORDMARK_HEIGHT = 22;
const AVATAR = { ring: 108, disc: 94 } as const;
// The hero's share of a tall window, as drawn (430 of 844 pt).
const HERO_SHARE = 0.51;

const ORDER = { avatar: 1, name: 2, primary: 4, secondary: 5, switch: 6 } as const;

/** What the device calls its unlock method. */
const LABEL = {
  faceId: 'welcomeBack.faceId',
  touchId: 'welcomeBack.touchId',
  biometrics: 'welcomeBack.biometrics',
} as const satisfies Record<BiometricKind, string>;

/**
 * 3.3 Welcome back: a signed-in user returning to the app unlocks it with Face ID (or the
 * device's equivalent) instead of typing a password. The password and switching account are
 * always offered. The streak and the waiting persona drawn on the design appear once that data
 * exists; a new account has neither, and inventing them would mislead.
 */
export function WelcomeBackScreen() {
  const { t } = useTranslation();
  const { color } = useTheme();
  const { session } = useAuthServices();
  const { status, user } = useSession();
  const access = useAccessDraft();
  /** `undefined` while the device is being asked; `null` when it has nothing to unlock with. */
  const [kind, setKind] = useState<BiometricKind | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [unlocking, setUnlocking] = useState(false);

  useEffect(() => {
    let current = true;
    void availableBiometrics().then((available) => {
      if (current) setKind(available);
    });
    return () => {
      current = false;
    };
  }, []);

  if (status !== 'signedIn' || !user) return <Redirect href={ROUTES.welcome} />;
  // Nothing to unlock with (no biometrics set up, or the web preview): there is no lock.
  if (kind === null) return <Redirect href={routeForSession({ status, user })} />;

  const name = user.firstName;

  async function unlock() {
    commitFeedback();
    setFailed(false);
    setUnlocking(true);
    const confirmed = await confirmWithBiometrics(t('welcomeBack.prompt'));
    setUnlocking(false);
    if (confirmed) router.replace(routeForSession(session.getState()));
    else setFailed(true);
  }

  async function switchAccount() {
    await session.signOut();
    access.reset();
    router.replace(ROUTES.signIn);
  }

  return (
    <HeroLayout
      panel
      centerBody
      heroShare={HERO_SHARE}
      hero={
        <View className="items-center gap-8">
          <Wordmark height={WORDMARK_HEIGHT} color={color.fg} label={t('common.appName')} />
          <View className="items-center gap-3.5">
            <Pop delay={staggerDelay(ORDER.avatar)}>
              <View
                aria-hidden
                style={{ width: AVATAR.ring, height: AVATAR.ring }}
                className="items-center justify-center rounded-pill border border-border bg-bg"
              >
                <View
                  style={{ width: AVATAR.disc, height: AVATAR.disc }}
                  className="items-center justify-center rounded-pill bg-fg"
                >
                  <Text variant="title" tone="inherit" className="text-bg">
                    {(name || user.email).charAt(0).toUpperCase()}
                  </Text>
                </View>
              </View>
            </Pop>
            <Reveal delay={staggerDelay(ORDER.name)}>
              <View className="items-center gap-0.5">
                <Text variant="title" accessibilityRole="header" className="text-center">
                  {name ? t('welcomeBack.title', { name }) : t('welcomeBack.titleNoName')}
                </Text>
                <Text variant="bodySmall" tone="muted" className="text-center">
                  {user.email}
                </Text>
              </View>
            </Reveal>
          </View>
        </View>
      }
      body={
        failed ? (
          <Text variant="callout" tone="muted" role="alert" className="text-center">
            {t('welcomeBack.failed')}
          </Text>
        ) : null
      }
      actions={
        <>
          {kind ? (
            <Reveal delay={staggerDelay(ORDER.primary)}>
              <Button
                label={t(LABEL[kind])}
                leading={
                  <Icon
                    name={kind === 'faceId' ? 'faceId' : 'lock'}
                    color={color.onPrimary}
                    size={size.iconLg}
                  />
                }
                loading={unlocking}
                onPress={unlock}
              />
            </Reveal>
          ) : null}
          <Reveal delay={staggerDelay(ORDER.secondary)}>
            <TextButton
              tone="primary"
              label={t('welcomeBack.usePassword')}
              onPress={() => {
                access.update({ email: user.email });
                router.push(ROUTES.signIn);
              }}
            />
          </Reveal>
          <Reveal delay={staggerDelay(ORDER.switch)}>
            <Text variant="callout" tone="subtle" className="pt-1 text-center">
              {name ? t('welcomeBack.notYou', { name }) : t('welcomeBack.notYouNoName')}{' '}
              <Link variant="labelSmall" onPress={switchAccount}>
                {t('welcomeBack.switchAccount')}
              </Link>
            </Text>
          </Reveal>
        </>
      }
    />
  );
}
