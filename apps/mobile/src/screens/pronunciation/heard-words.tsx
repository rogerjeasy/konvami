import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { PronunciationAttempt } from '@konvami/api-client';
import { Text } from '@/components/text';
import { useTheme } from '@/theme';

/**
 * The words of a drill, each as it was heard: the ones heard as asked as they are, the others
 * underlined in amber (a mistake while practising is never a red alarm). Said aloud for a screen
 * reader as one sentence, because the underline cannot be read.
 */
export function HeardWords({ words }: { words: PronunciationAttempt['words'] }) {
  const { t } = useTranslation();
  const { color } = useTheme();
  const missed = words.filter((mark) => !mark.ok).map((mark) => mark.word);
  return (
    <View
      accessible
      accessibilityLabel={
        missed.length
          ? t('pronunciation.sheet.missedLabel', { words: missed.join(', ') })
          : t('pronunciation.sheet.allHeard')
      }
    >
      <Text variant="emphasis">
        {words.flatMap((mark, i) => [
          i > 0 ? ' ' : '',
          mark.ok ? (
            mark.word
          ) : (
            <Text
              key={`${mark.word}:${i}`}
              variant="emphasis"
              tone="inherit"
              className="underline"
              style={{ textDecorationColor: color.warnMark }}
            >
              {mark.word}
            </Text>
          ),
        ])}
      </Text>
    </View>
  );
}
