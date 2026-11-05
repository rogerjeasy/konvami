import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { PlayButton } from '@/components/play-button';
import { Text } from '@/components/text';
import { useSound } from '@/hooks/use-sound';
import { commitFeedback } from '@/lib/haptics';
import { usePracticeServices } from '@/practice/services';

/**
 * Plays a word or sentence of the lab in the first partner's voice (made the first time). With a
 * `label` the text is written beside the button; without, the button alone ("which one was it?")
 * must not give the word away, so it says only "Play the word". `rate` slows a sentence down.
 */
export function ListenButton({
  text,
  label,
  rate = 1,
}: {
  text: string;
  label?: string;
  rate?: number;
}) {
  const { t } = useTranslation();
  const { pronunciationSound } = usePracticeServices();
  const { state, toggle } = useSound(text, pronunciationSound, rate);
  const accessibilityLabel =
    state === 'playing'
      ? t('pronunciation.stop')
      : label
        ? t('pronunciation.playText', { text: label })
        : t('pronunciation.playWord');
  return (
    <View className="flex-row items-center gap-3">
      <PlayButton
        label={accessibilityLabel}
        state={state}
        onPress={() => {
          commitFeedback();
          toggle();
        }}
      />
      {label ? (
        <Text variant="labelMedium" className="shrink">
          {label}
        </Text>
      ) : null}
    </View>
  );
}
