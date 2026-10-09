import { useEffect, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { motion, size } from '@konvami/design-tokens';
import { LogoMark } from '@/components/brand';
import { Button } from '@/components/button';
import { HeroLayout } from '@/components/hero-layout';
import { Icon, type IconName } from '@/components/icon';
import { Loop, Pop, Reveal } from '@/components/motion';
import { HeaderButton } from '@/components/step-header';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { useScreenLayout } from '@/hooks/use-screen-layout';
import { commitFeedback } from '@/lib/haptics';
import { heroDrawingSize, ILLUSTRATION_MAX_FONT_SCALE } from '@/lib/layout';
import { askForMicrophone, microphoneAllowed } from '@/lib/microphone';
import { staggerDelay } from '@/lib/motion';
import { ROUTES } from '@/lib/routes';
import { useTheme } from '@/theme';
import { SETUP } from './sample-content';

// The drawing on the design's 288 pt frame: two rings, a soft disc and the microphone disc.
const FRAME = 288;
const RINGS = [288, 212] as const;
const SOFT_DISC = 144;
const MIC_DISC = 104;
const MIC_ICON = 40;
// The "listening" chip: its logo, and where it sits on the frame (from the top and right edges).
const CHIP = { logo: 24, top: 54, right: -21 } as const;

// The hero's share of a tall window, as drawn (350 of 844 pt): the three reassurances fit below.
const HERO_SHARE = 0.42;

const BREATHE = { from: { transform: [{ scale: 1 }] }, to: { transform: [{ scale: 1.1 }] } };

const POINTS: readonly { icon: IconName; text: 'pointSession' | 'pointIndicator' | 'pointText' }[] =
  [
    { icon: 'clock', text: 'pointSession' },
    { icon: 'eye', text: 'pointIndicator' },
    { icon: 'keyboard', text: 'pointText' },
  ];

// Text and buttons rise in after the drawing has popped (positions in the stagger).
const ORDER = { chip: 4, title: 2, body: 3, points: 4, primary: 7, secondary: 8 } as const;

/** The microphone inside its rings, with the partner saying it is listening. Decorative. */
function MicIllustration() {
  const { color } = useTheme();
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
          className="rounded-pill border border-field-border"
        />
      ))}
      <Loop keyframes={BREATHE} duration={motion.breathe} alternate style={centred(SOFT_DISC)}>
        <View className="h-full w-full rounded-pill bg-primary-soft" />
      </Loop>
      <Pop style={centred(MIC_DISC)}>
        <View className="h-full w-full items-center justify-center rounded-pill bg-primary">
          <Icon name="mic" color={color.onPrimary} size={MIC_ICON * k} />
        </View>
      </Pop>
      <Pop
        delay={staggerDelay(ORDER.chip)}
        style={{ position: 'absolute', top: CHIP.top * k, right: CHIP.right * k }}
      >
        <View className="flex-row items-center gap-1.5 rounded-button rounded-br-sm border border-border bg-chip py-1.5 pl-1.5 pr-3">
          <LogoMark size={CHIP.logo} tile />
          <Text
            variant="labelSmall"
            className="font-display"
            maxFontSizeMultiplier={ILLUSTRATION_MAX_FONT_SCALE}
          >
            {SETUP.listening}
          </Text>
        </View>
      </Pop>
    </View>
  );
}

/**
 * 2.6 Microphone: explains why the app needs the mic before the system prompt appears. Whatever
 * the answer, the user moves on: a refusal is a choice, never an error, and text mode covers it.
 */
export function MicrophoneScreen() {
  const { t } = useTranslation();
  const { color } = useTheme();
  const [asking, setAsking] = useState(false);

  const next = () => router.replace(ROUTES.allSet);

  // Already allowed (an earlier sign-up on this phone, or a setting changed since): there is
  // nothing to ask, so this screen steps aside.
  useEffect(() => {
    let current = true;
    void microphoneAllowed().then((allowed) => {
      if (allowed && current) router.replace(ROUTES.allSet);
    });
    return () => {
      current = false;
    };
  }, []);

  async function allow() {
    commitFeedback();
    setAsking(true);
    // The system prompt's answer is the user's: nothing here depends on which one it was.
    await askForMicrophone();
    setAsking(false);
    next();
  }

  return (
    <HeroLayout
      panel
      heroShare={HERO_SHARE}
      heroHeader={<HeaderButton icon="close" label={t('common.close')} onPress={next} />}
      hero={<MicIllustration />}
      body={
        <>
          <Reveal delay={staggerDelay(ORDER.title)}>
            <Text variant="title" accessibilityRole="header">
              {t('microphone.title')}
            </Text>
          </Reveal>
          <Reveal delay={staggerDelay(ORDER.body)}>
            <Text tone="muted">{t('microphone.body')}</Text>
          </Reveal>
          <Reveal delay={staggerDelay(ORDER.points)}>
            <View className="gap-4 pt-3">
              {POINTS.map(({ icon, text }) => (
                <View key={text} className="flex-row items-center gap-3.5">
                  <View
                    aria-hidden
                    style={{ width: size.avatarSm, height: size.avatarSm }}
                    className="items-center justify-center rounded-md bg-surface"
                  >
                    <Icon name={icon} color={color.fg} size={size.iconMd} />
                  </View>
                  <Text variant="bodySmall" className="flex-1">
                    {t(`microphone.${text}`)}
                  </Text>
                </View>
              ))}
            </View>
          </Reveal>
        </>
      }
      actions={
        <>
          <Reveal delay={staggerDelay(ORDER.primary)}>
            <Button
              label={t('microphone.allow')}
              leading={<Icon name="mic" color={color.onPrimary} size={size.iconMd} />}
              loading={asking}
              onPress={allow}
            />
          </Reveal>
          <Reveal delay={staggerDelay(ORDER.secondary)}>
            <TextButton label={t('microphone.notNow')} onPress={next} />
          </Reveal>
        </>
      }
    />
  );
}
