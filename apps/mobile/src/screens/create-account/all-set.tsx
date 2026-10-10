import { useEffect } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { Trans, useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import { useSession } from '@/auth';
import { LogoMark } from '@/components/brand';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { HeroLayout } from '@/components/hero-layout';
import { Icon } from '@/components/icon';
import { Pop, Reveal } from '@/components/motion';
import { PersonaAvatar } from '@/components/persona-avatar';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { useScreenLayout } from '@/hooks/use-screen-layout';
import { commitFeedback, successFeedback } from '@/lib/haptics';
import { heroDrawingSize, ILLUSTRATION_MAX_FONT_SCALE } from '@/lib/layout';
import { staggerDelay } from '@/lib/motion';
import { ROUTES } from '@/lib/routes';
import { useOnboardingStore } from '@/onboarding/services';
import { useTheme } from '@/theme';
import { SETUP } from './sample-content';

// The drawing on the design's 300 pt frame: two rings around the logo mark, and the greeting.
const FRAME = 300;
const RINGS = [300, 210] as const;
const LOGO = 136;
const BUBBLE = { top: 40, right: -1 } as const;

// The hero's share of a tall window, as drawn (390 of 844 pt): the guide card fits below.
const HERO_SHARE = 0.46;

// The logo pops first, then the greeting; text and buttons rise in after (stagger positions).
const ORDER = { bubble: 3, title: 4, body: 5, guide: 6, trial: 7, primary: 9, secondary: 10 };

/** The Konvami mark greeting the new user by name, on the brand ground. Decorative. */
function GreetingIllustration({ name }: { name: string }) {
  const { illustrationWidth } = useScreenLayout();
  const { height: windowHeight } = useWindowDimensions();
  const width = heroDrawingSize({ frame: FRAME, available: illustrationWidth, windowHeight });
  const k = width / FRAME;
  const centred = (diameter: number) => ({
    position: 'absolute' as const,
    width: diameter * k,
    height: diameter * k,
    left: ((FRAME - diameter) / 2) * k,
    top: ((FRAME - diameter) / 2) * k,
  });
  return (
    <View style={{ width, height: width, pointerEvents: 'none' }} aria-hidden>
      {RINGS.map((diameter) => (
        <View
          key={diameter}
          style={centred(diameter)}
          className="rounded-pill border border-on-splash opacity-ring"
        />
      ))}
      <Pop style={centred(LOGO)}>
        <LogoMark size={LOGO * k} />
      </Pop>
      <Pop
        delay={staggerDelay(ORDER.bubble)}
        style={{ position: 'absolute', top: BUBBLE.top * k, right: BUBBLE.right * k }}
      >
        <View className="rounded-button rounded-br-sm bg-brand-bubble px-3.5 py-2">
          <Text
            variant="labelMedium"
            tone="inherit"
            className="font-display text-brand-on-bubble"
            maxFontSizeMultiplier={ILLUSTRATION_MAX_FONT_SCALE}
          >
            {SETUP.greeting(name)}
          </Text>
        </View>
      </Pop>
    </View>
  );
}

/**
 * 2.7 All set: the account is ready. From here the setup guide tunes the app to the learner
 * (spec §6.1), by voice (4.1) or with the form (4.2).
 */
export function AllSetScreen() {
  const { t } = useTranslation();
  const { color } = useTheme();
  const { status, user } = useSession();
  const onboarding = useOnboardingStore();

  // One success haptic, with the celebration it belongs to.
  useEffect(() => {
    if (status === 'signedIn') successFeedback();
  }, [status]);

  // Loaded while the user reads, so the first question is ready when they tap. On dev this
  // also wakes a paused database.
  useEffect(() => {
    if (status === 'signedIn') void onboarding.load();
  }, [status, onboarding]);

  if (status !== 'signedIn' || !user) return <Redirect href={ROUTES.welcome} />;

  const guide = SETUP.guide.name;
  const start = () => {
    commitFeedback();
    router.push(ROUTES.onboardingTalk);
  };

  return (
    <HeroLayout
      panel="splash"
      heroShare={HERO_SHARE}
      hero={<GreetingIllustration name={user.firstName} />}
      body={
        <>
          <Reveal delay={staggerDelay(ORDER.title)}>
            <Text variant="title" accessibilityRole="header">
              {t('allSet.title', { name: user.firstName })}
            </Text>
          </Reveal>
          <Reveal delay={staggerDelay(ORDER.body)}>
            <Text tone="muted">{t('allSet.body')}</Text>
          </Reveal>
          <Reveal delay={staggerDelay(ORDER.guide)}>
            <Card className="mt-2 flex-row items-center gap-3 bg-bg p-3.5">
              <PersonaAvatar look={SETUP.guide.look} diameter={size.avatarMd} />
              <View className="flex-1 gap-0.5">
                <Text variant="labelMedium">{t('allSet.guide', { name: guide })}</Text>
                <Text variant="small" tone="subtle">
                  {t('allSet.guideLanguages')}
                </Text>
              </View>
              <View className="rounded-sm bg-surface px-1.5 py-1">
                <Text variant="badge" tone="muted">
                  {t('common.aiBadge')}
                </Text>
              </View>
            </Card>
          </Reveal>
          <Reveal delay={staggerDelay(ORDER.trial)}>
            <View className="flex-row items-center gap-2.5 px-1">
              <Icon name="gift" color={color.primaryText} size={size.iconMd} />
              <Text variant="callout" tone="primary" className="flex-1">
                <Trans
                  i18nKey="allSet.trial"
                  components={{ strong: <Text variant="labelSmall" tone="primary" /> }}
                />
              </Text>
            </View>
          </Reveal>
        </>
      }
      actions={
        <>
          <Reveal delay={staggerDelay(ORDER.primary)}>
            <Button
              label={t('allSet.start', { name: guide })}
              leading={<Icon name="mic" color={color.onPrimary} size={size.iconMd} />}
              onPress={start}
            />
          </Reveal>
          <Reveal delay={staggerDelay(ORDER.secondary)}>
            <TextButton
              tone="primary"
              label={t('allSet.form')}
              onPress={() => router.push(ROUTES.onboardingLanguage)}
            />
          </Reveal>
        </>
      }
    />
  );
}
