import { useEffect, useMemo, type ReactNode } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { Trans, useTranslation } from 'react-i18next';
import { motion, size } from '@konvami/design-tokens';
import { Card } from '@/components/card';
import { ChatBubble } from '@/components/chat';
import { Icon } from '@/components/icon';
import { Animate, Loop, Pop, Reveal } from '@/components/motion';
import { PersonaAvatar } from '@/components/persona-avatar';
import { Pill } from '@/components/pill';
import { Text } from '@/components/text';
import { useScreenLayout } from '@/hooks/use-screen-layout';
import { formatDuration, formatPercent, weekdayInitials } from '@/lib/format';
import { ILLUSTRATION_MAX_FONT_SCALE as MAX_SCALE } from '@/lib/layout';
import { EASE_OUT, growKeyframes, pct, staggerDelay } from '@/lib/motion';
import { useTheme } from '@/theme';
import { SAMPLE } from './sample-content';

/**
 * The intro illustrations: small scenes of the real product (a conversation, a correction,
 * progress and memory) that play when their slide becomes active (`play`). They are decorative:
 * screen readers skip them, the slide title says it.
 */
type SceneProps = { play: boolean };

function Illustration({ children }: { children: ReactNode }) {
  const { illustrationWidth } = useScreenLayout();
  return (
    <View style={{ width: illustrationWidth, pointerEvents: 'none' }} className="gap-3" aria-hidden>
      {children}
    </View>
  );
}

// ─── 1.2 Speak ──────────────────────────────────────────────────────────────────────────────

// Voice-orb geometry (pt): outer halo, inner disc, and the level bars inside it.
const ORB = { halo: 148, disc: 108, bars: [16, 32, 44, 26, 38, 18], barWidth: 5 } as const;
// Each level bar bounces at its own pace so the orb looks like a live voice (ms).
const VOICE_BAR_BASE = 420;
const VOICE_BAR_SPREAD = 70;

const HALO_BREATHE = { from: { transform: [{ scale: 1 }] }, to: { transform: [{ scale: 1.08 }] } };
const VOICE_LEVEL = {
  from: { transform: [{ scaleY: 0.35 }] },
  to: { transform: [{ scaleY: 1 }] },
};
const LIVE_DOT = { from: { opacity: 1 }, to: { opacity: 0.25 } };

/** The order things appear in the Speak scene (positions in the stagger). */
const SPEAK = { persona: 0, orb: 2, question: 6, answer: 12 } as const;

/** 1.2 · A persona listening while you talk: the orb breathes, the voice bars dance, the chat runs. */
export function SpeakIllustration({ play }: SceneProps) {
  const { t } = useTranslation();
  return (
    <Illustration>
      <Reveal play={play} delay={staggerDelay(SPEAK.persona)} style={{ alignSelf: 'center' }}>
        <Card className="flex-row items-center gap-2.5 rounded-pill py-2 pl-2 pr-3.5">
          <PersonaAvatar look={SAMPLE.persona.look} />
          <View className="shrink">
            <Text variant="label" maxFontSizeMultiplier={MAX_SCALE}>
              {SAMPLE.persona.name}
            </Text>
            <Text variant="caption" tone="subtle" maxFontSizeMultiplier={MAX_SCALE}>
              {t('illustration.personaRole')}
            </Text>
          </View>
          <Pill
            tone="success"
            decorative
            label={t('illustration.listening')}
            leading={
              <Loop keyframes={LIVE_DOT} duration={motion.breathe / 3} alternate play={play}>
                <View className="h-1.5 w-1.5 rounded-pill bg-success" />
              </Loop>
            }
          />
        </Card>
      </Reveal>

      <Pop play={play} delay={staggerDelay(SPEAK.orb)} style={{ alignSelf: 'center' }}>
        <View style={{ width: ORB.halo, height: ORB.halo }} className="items-center justify-center">
          <Loop
            keyframes={HALO_BREATHE}
            duration={motion.breathe}
            alternate
            play={play}
            style={{ position: 'absolute', width: ORB.halo, height: ORB.halo }}
          >
            <View className="h-full w-full rounded-pill bg-primary-soft" />
          </Loop>
          <View
            style={{ width: ORB.disc, height: ORB.disc }}
            className="flex-row items-center justify-center gap-1 rounded-pill bg-primary"
          >
            {ORB.bars.map((height, i) => (
              <Loop
                key={i}
                keyframes={VOICE_LEVEL}
                duration={VOICE_BAR_BASE + i * VOICE_BAR_SPREAD}
                delay={i * VOICE_BAR_SPREAD}
                alternate
                play={play}
              >
                <View
                  style={{ width: ORB.barWidth, height }}
                  className="rounded-sm bg-on-primary"
                />
              </Loop>
            ))}
          </View>
        </View>
      </Pop>

      <Reveal play={play} delay={staggerDelay(SPEAK.question)}>
        <ChatBubble from="persona" gloss={t('illustration.personaLineGloss')} decorative>
          {SAMPLE.chat.personaLine}
        </ChatBubble>
      </Reveal>
      <Reveal play={play} delay={staggerDelay(SPEAK.answer)}>
        <ChatBubble from="learner" decorative>
          {SAMPLE.chat.learnerLine}
        </ChatBubble>
      </Reveal>
    </Illustration>
  );
}

// ─── 1.3 Corrections ────────────────────────────────────────────────────────────────────────

// Width of one bar in the recording waveform (pt), and one play-through of the recording (ms).
const WAVE_BAR_WIDTH = 3;
const WAVE_CYCLE = 3000;
// Share of the cycle the playhead takes to cross the waveform; the rest holds, then resets.
const WAVE_SWEEP = 0.7;

/** The order things appear in the Corrections scene. */
const CORRECT = { said: 0, card: 3, fix: 7, word: 9, saved: 13 } as const;

/** One waveform bar that lights up when the looping playhead passes it. */
function WaveBar({
  height,
  index,
  count,
  play,
}: {
  height: number;
  index: number;
  count: number;
  play: boolean;
}) {
  const { color } = useTheme();
  const keyframes = useMemo(() => {
    const at = Math.round((index / count) * WAVE_SWEEP * 100);
    return {
      from: { backgroundColor: color.track },
      [pct(Math.max(at, 1))]: { backgroundColor: color.track },
      [pct(Math.min(at + 2, 98))]: { backgroundColor: color.primary },
      [pct(99)]: { backgroundColor: color.primary },
      to: { backgroundColor: color.track },
    };
  }, [color, count, index]);
  return (
    <Loop keyframes={keyframes} duration={WAVE_CYCLE} linear play={play}>
      <View
        style={{ height, width: WAVE_BAR_WIDTH }}
        className={`rounded-sm ${index < SAMPLE.correction.played ? 'bg-primary' : 'bg-track'}`}
      />
    </Loop>
  );
}

/** 1.3 · You say it, a gentle correction slides in with your recording, and a word gets saved. */
export function CorrectionsIllustration({ play }: SceneProps) {
  const { t } = useTranslation();
  const { color } = useTheme();
  const c = SAMPLE.correction;
  return (
    <Illustration>
      <Reveal play={play} delay={staggerDelay(CORRECT.said)}>
        <ChatBubble from="learner" decorative>
          {c.before}
          <Text
            variant="chat"
            tone="onPrimary"
            className="underline"
            style={{ textDecorationColor: color.warnMark }}
          >
            {c.wrong}
          </Text>
          {c.after}
        </ChatBubble>
      </Reveal>

      <Reveal play={play} delay={staggerDelay(CORRECT.card)}>
        <Card className="gap-2.5 p-4">
          <View className="flex-row flex-wrap items-center justify-between gap-2">
            <Pop play={play} delay={staggerDelay(CORRECT.fix)}>
              <Pill tone="warn" decorative label={t('illustration.polish')} />
            </Pop>
            <Text variant="caption" tone="subtle" maxFontSizeMultiplier={MAX_SCALE}>
              {c.topic}
            </Text>
          </View>
          <Text variant="emphasis" maxFontSizeMultiplier={MAX_SCALE}>
            {c.before}
            <Text variant="emphasis" tone="primary" className="rounded-sm bg-primary-soft">
              {` ${c.correct} `}
            </Text>
            {c.after}
          </Text>
          <Text variant="small" tone="muted" maxFontSizeMultiplier={MAX_SCALE}>
            <Trans
              i18nKey="illustration.correctionRule"
              values={c.rule}
              components={{
                em: <Text variant="small" tone="muted" className="italic" />,
                strong: <Text variant="small" className="font-body-semibold" />,
              }}
            />
          </Text>
          <View className="flex-row items-center gap-2.5 pt-0.5">
            <View className="h-9 w-9 items-center justify-center rounded-pill bg-primary">
              <Icon name="play" color={color.onPrimary} size={size.iconSm} />
            </View>
            <View className="flex-1 flex-row items-center gap-0.5">
              {c.waveform.map((height, i) => (
                <WaveBar key={i} height={height} index={i} count={c.waveform.length} play={play} />
              ))}
            </View>
            <Text variant="caption" tone="subtle" maxFontSizeMultiplier={MAX_SCALE}>
              {formatDuration(c.duration)}
            </Text>
          </View>
        </Card>
      </Reveal>

      <Reveal play={play} delay={staggerDelay(CORRECT.word)}>
        <Card className="flex-row items-center gap-3 px-3.5 py-3">
          <View
            style={{ width: size.avatarSm, height: size.avatarSm }}
            className="items-center justify-center rounded-md bg-primary-soft"
          >
            <Icon name="book" color={color.primaryText} size={size.iconMd} />
          </View>
          <View className="flex-1">
            <Text variant="captionStrong" tone="primary" maxFontSizeMultiplier={MAX_SCALE}>
              {t('illustration.newWordSaved')}
            </Text>
            <Text variant="label" maxFontSizeMultiplier={MAX_SCALE}>
              {SAMPLE.newWord.word}
              <Text variant="callout" tone="subtle">{` · ${t('illustration.wordGloss')}`}</Text>
            </Text>
          </View>
          <Pop play={play} delay={staggerDelay(CORRECT.saved)}>
            <Icon name="check" color={color.success} size={size.iconMd} strokeWidth={2.4} />
          </Pop>
        </Card>
      </Reveal>
    </Illustration>
  );
}

// ─── 1.4 Progress & memory ──────────────────────────────────────────────────────────────────

// Level ring geometry (pt).
const RING = { size: 88, stroke: 8 } as const;
// Tallest weekly bar (pt) and the stub drawn for a day without practice.
const CHART = { maxBar: 46, emptyBar: 6 } as const;
// The ring fills a little slower than other entrances so the eye can follow it (ms).
const RING_FILL = 900;

const FLICKER = {
  from: { transform: [{ scale: 1 }, { rotate: '-6deg' }] },
  to: { transform: [{ scale: 1.15 }, { rotate: '6deg' }] },
};

/** The order things appear in the Progress scene. */
const PROGRESS = { card: 0, ring: 2, level: 4, bars: 5, memory: 12 } as const;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** The level ring draws itself up to `ratio` when the scene plays. */
function LevelRing({
  ratio,
  play,
  children,
}: {
  ratio: number;
  play: boolean;
  children: ReactNode;
}) {
  const { color } = useTheme();
  const reduced = useReducedMotion();
  const r = (RING.size - RING.stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const filled = useSharedValue(ratio);

  useEffect(() => {
    if (!play || reduced) {
      filled.set(ratio);
      return;
    }
    filled.set(0);
    filled.set(
      withDelay(
        staggerDelay(PROGRESS.ring),
        withTiming(ratio, { duration: RING_FILL, easing: EASE_OUT }),
      ),
    );
  }, [filled, play, ratio, reduced]);

  const arc = useAnimatedProps(() => ({
    strokeDasharray: [circumference * filled.get(), circumference],
  }));

  const c = RING.size / 2;
  return (
    <View style={{ width: RING.size, height: RING.size }} className="items-center justify-center">
      <Svg width={RING.size} height={RING.size} style={{ position: 'absolute' }}>
        <Circle cx={c} cy={c} r={r} stroke={color.track} strokeWidth={RING.stroke} fill="none" />
        <AnimatedCircle
          cx={c}
          cy={c}
          r={r}
          stroke={color.primary}
          strokeWidth={RING.stroke}
          strokeLinecap="round"
          fill="none"
          animatedProps={arc}
          transform={`rotate(-90 ${c} ${c})`}
        />
      </Svg>
      {children}
    </View>
  );
}

/** One day's bar: grows up from the baseline when the scene plays. */
function DayBar({
  height,
  tone,
  order,
  play,
}: {
  height: number;
  tone: 'today' | 'practised' | 'empty';
  order: number;
  play: boolean;
}) {
  const reduced = useReducedMotion();
  const keyframes = useMemo(() => growKeyframes(height, reduced), [height, reduced]);
  const fill = { today: 'bg-primary', practised: 'bg-primary-soft', empty: 'bg-track' }[tone];
  return (
    <View style={{ height }} className="w-full overflow-hidden rounded-sm">
      <Animate
        keyframes={keyframes}
        delay={staggerDelay(PROGRESS.bars + order)}
        play={play}
        style={{ height, width: '100%' }}
      >
        <View className={`h-full w-full ${fill}`} />
      </Animate>
    </View>
  );
}

/** 1.4 · Your level ring fills, the week's bars grow, the streak flickers, your buddy remembers. */
export function MemoryIllustration({ play }: SceneProps) {
  const { t, i18n } = useTranslation();
  const { color } = useTheme();
  const p = SAMPLE.progress;
  const days = weekdayInitials(i18n.language);
  const most = Math.max(...p.minutesByDay);

  return (
    <Illustration>
      <Reveal play={play} delay={staggerDelay(PROGRESS.card)}>
        <Card className="gap-4 rounded-panel p-4">
          <View className="flex-row items-center gap-4">
            <LevelRing ratio={p.toLevel} play={play}>
              <Pop
                play={play}
                delay={staggerDelay(PROGRESS.level)}
                style={{ alignItems: 'center' }}
              >
                <Text variant="stat" maxFontSizeMultiplier={MAX_SCALE}>
                  {p.level}
                </Text>
                <Text variant="micro" tone="subtle" maxFontSizeMultiplier={MAX_SCALE}>
                  {formatPercent(i18n.language, p.toLevel)}
                </Text>
              </Pop>
            </LevelRing>
            <View className="flex-1 gap-1.5">
              <Text variant="overline" tone="subtle" maxFontSizeMultiplier={MAX_SCALE}>
                {t('illustration.yourLanguage')}
              </Text>
              <Text variant="heading" maxFontSizeMultiplier={MAX_SCALE}>
                {t('illustration.onYourWay', { level: p.level })}
              </Text>
              <Pill
                tone="warn"
                decorative
                label={t('illustration.streak', { count: p.streakDays })}
                leading={
                  <Loop keyframes={FLICKER} duration={motion.breathe / 4} alternate play={play}>
                    <Icon name="flame" color={color.warnIcon} size={size.iconSm - 1} />
                  </Loop>
                }
              />
            </View>
          </View>
          <View className="flex-row items-end justify-between gap-2">
            {p.minutesByDay.map((minutes, i) => {
              const today = i === p.todayIndex;
              return (
                <View key={i} className="flex-1 items-center gap-1">
                  <DayBar
                    height={minutes ? (minutes / most) * CHART.maxBar : CHART.emptyBar}
                    tone={today ? 'today' : minutes ? 'practised' : 'empty'}
                    order={i}
                    play={play}
                  />
                  <Text
                    variant="micro"
                    tone={today ? 'fg' : 'subtle'}
                    className={today ? 'font-body-bold' : ''}
                    maxFontSizeMultiplier={MAX_SCALE}
                  >
                    {days[i]}
                  </Text>
                </View>
              );
            })}
          </View>
        </Card>
      </Reveal>

      <Reveal play={play} delay={staggerDelay(PROGRESS.memory)}>
        <Card className="flex-row gap-3 p-3.5">
          <PersonaAvatar look={SAMPLE.persona.look} />
          <View className="flex-1 gap-0.5">
            <Text variant="captionStrong" tone="primary" maxFontSizeMultiplier={MAX_SCALE}>
              {t('illustration.remembers', { name: SAMPLE.persona.name })}
            </Text>
            <Text variant="callout" maxFontSizeMultiplier={MAX_SCALE}>
              {t('illustration.memoryLine')}
            </Text>
          </View>
        </Card>
      </Reveal>
    </Illustration>
  );
}
