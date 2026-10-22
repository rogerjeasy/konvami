import type { ReactNode } from 'react';
import { useWindowDimensions, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  type SharedValue,
} from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { opacity, size } from '@konvami/design-tokens';
import { Avatar } from '@/components/avatar/avatar';
import type { AvatarLook, AvatarMood } from '@/components/avatar/look';
import { Badge } from '@/components/badge';
import { Button } from '@/components/button';
import { ChatBubble } from '@/components/chat';
import { HeroLayout } from '@/components/hero-layout';
import { Icon } from '@/components/icon';
import { Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { Pill } from '@/components/pill';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { useScreenLayout } from '@/hooks/use-screen-layout';
import { stepFeedback } from '@/lib/haptics';
import { heroDrawingSize } from '@/lib/layout';
import { useTheme } from '@/theme';
import type { ConversationPhase } from '@/voice/conversation';
import type { VoiceCall } from '@/voice/use-voice-call';

// The avatar on the design's frame (pt), and the share of a tall window its panel takes.
const AVATAR_FRAME = 200;
const HERO_SHARE = 0.44;
// The listening ring stands this far outside the avatar and grows by this share when loud.
const RING_GAP = 10;
const RING_GROWTH = 0.08;
const RING_WIDTH = 3;

const MOOD: Record<ConversationPhase, AvatarMood> = {
  connecting: 'waiting',
  thinking: 'thinking',
  speaking: 'speaking',
  listening: 'idle',
  hearing: 'attentive',
};

/** A ring around the avatar that swells with the learner's voice: "I can hear you". Decorative. */
function ListeningRing({ level, diameter }: { level: SharedValue<number>; diameter: number }) {
  const { color } = useTheme();
  const reduced = useReducedMotion();
  const style = useAnimatedStyle(() => ({
    opacity: opacity.ring + (1 - opacity.ring) * level.get(),
    transform: [{ scale: reduced ? 1 : 1 + RING_GROWTH * level.get() }],
  }));
  const ring = diameter + RING_GAP * 2;
  return (
    // Styled directly: utility classes are not applied to this animated view.
    <Animated.View
      aria-hidden
      style={[
        {
          position: 'absolute',
          width: ring,
          height: ring,
          top: -RING_GAP,
          left: -RING_GAP,
          borderRadius: ring / 2,
          borderWidth: RING_WIDTH,
          borderColor: color.primary,
          pointerEvents: 'none',
        },
        style,
      ]}
    />
  );
}

/**
 * A live conversation as every call shows it (the spoken setup 4.1, the placement test 4.5, a
 * practice conversation 5.3): the persona's portrait, who is speaking, the latest line of each
 * side, what is done so far and the microphone. The screen around it decides who the call is
 * with, what it is for, where it leads and what to offer when it fails.
 */
export function CallStage({
  call,
  persona,
  header,
  hint,
  finishedLabel,
  progress,
  mainAction,
  sideAction,
  hiddenPersonaText = null,
  problem,
  failedActions,
}: {
  call: VoiceCall;
  /** Who the learner is talking to. */
  persona: { name: string; look: AvatarLook };
  /** The row across the top (ending the call, the way out to another mode). */
  header: ReactNode;
  /** Shown under the portrait until someone has said something. */
  hint: string;
  /** The status line once the call has done its job and the goodbye is being said. */
  finishedLabel: string;
  /** What is done so far (`ProgressChips`), for a call that works through a list. */
  progress?: ReactNode;
  /**
   * The action this call is mostly used with, when it has one ("I don't know" in the test). It
   * takes the button's place, and the microphone control becomes a quiet text action under it.
   */
  mainAction?: ReactNode;
  /** A quiet action beside the microphone control under `mainAction` ("Help"). */
  sideAction?: ReactNode;
  /**
   * Shown instead of the persona's words when the learner hid them to practise listening;
   * null shows the words.
   */
  hiddenPersonaText?: string | null;
  /** The message for the call's failure, when it has failed. */
  problem: string | null;
  /** What the learner can do after a failure. */
  failedActions: ReactNode;
}) {
  const { t } = useTranslation();
  const { color } = useTheme();
  const { illustrationWidth } = useScreenLayout(HERO_SHARE);
  const { height: windowHeight } = useWindowDimensions();
  const { conversation } = call;
  const { name } = persona;

  const live = call.status === 'live';
  const failed = call.status === 'failed';
  const phase: ConversationPhase = live ? conversation.phase : 'connecting';
  // The latest line of each speaker, in the order they were spoken.
  const lines = conversation.captions.filter(
    (caption, index, all) => all.findLastIndex((c) => c.speaker === caption.speaker) === index,
  );
  const muteLabel = t(call.muted ? 'call.unmute' : 'call.mute');
  const toggleMute = () => {
    stepFeedback();
    call.toggleMute();
  };
  const avatarSize = heroDrawingSize({
    frame: AVATAR_FRAME,
    available: illustrationWidth,
    windowHeight,
  });

  return (
    <HeroLayout
      panel
      heroShare={HERO_SHARE}
      screenHeader={header}
      hero={
        <View className="items-center gap-4">
          <View style={{ width: avatarSize, height: avatarSize }}>
            <ListeningRing level={call.voice} diameter={avatarSize} />
            <Avatar
              look={persona.look}
              size={avatarSize}
              mood={failed ? 'waiting' : MOOD[phase]}
              mouth={call.mouth}
            />
          </View>
          <View className="items-center gap-1.5">
            <View className="flex-row items-center gap-2">
              <Text variant="heading" accessibilityRole="header">
                {name}
              </Text>
              <Badge label={t('common.aiBadge')} tone="chip" />
            </View>
            {failed ? null : (
              <Text
                variant="labelSmall"
                tone={phase === 'hearing' || phase === 'listening' ? 'primary' : 'muted'}
                accessibilityLiveRegion="polite"
                className="text-center"
              >
                {conversation.finished ? finishedLabel : t(`call.status.${phase}`, { name })}
              </Text>
            )}
            {live && call.muted ? (
              <Pill
                tone="warn"
                label={t('call.muted')}
                leading={<Icon name="micOff" color={color.warnText} size={size.iconSm} />}
              />
            ) : null}
          </View>
        </View>
      }
      body={
        <>
          {lines.length === 0 && !failed ? (
            <Text tone="muted" className="text-center">
              {hint}
            </Text>
          ) : null}
          {lines.map((line) =>
            line.speaker === 'persona' ? (
              hiddenPersonaText ? (
                <Text key={line.id} tone="muted" className="text-center">
                  {hiddenPersonaText}
                </Text>
              ) : (
                <Text key={line.id} variant="emphasis" className="text-center">
                  {line.text}
                </Text>
              )
            ) : (
              <ChatBubble key={line.id} from="learner">
                {line.text}
              </ChatBubble>
            ),
          )}
          {progress}
        </>
      }
      actions={
        failed && problem ? (
          <>
            <Reveal>
              <NoticeBox icon="alert" tone="danger">
                {problem}
              </NoticeBox>
            </Reveal>
            {failedActions}
          </>
        ) : (
          <>
            {mainAction}
            {mainAction ? (
              <View className="flex-row flex-wrap justify-center gap-x-2">
                <TextButton
                  tone="primary"
                  disabled={!live || conversation.finished}
                  label={muteLabel}
                  onPress={toggleMute}
                />
                {sideAction}
              </View>
            ) : (
              <Button
                variant="secondary"
                disabled={!live || conversation.finished}
                label={muteLabel}
                leading={
                  <Icon name={call.muted ? 'micOff' : 'mic'} color={color.fg} size={size.iconMd} />
                }
                onPress={toggleMute}
              />
            )}
          </>
        )
      }
    />
  );
}
