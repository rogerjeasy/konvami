import { View } from 'react-native';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { captionWords } from '@/lib/caption-words';

/** The words of a caption, in the serif of the language learned (v4). Each word has a real touch target; punctuation remains visible in its original order. */
export function CaptionWords({
  caption,
  lookupLabel,
  onSelect,
  tone = 'primary',
}: {
  caption: string;
  tone?: 'primary' | 'onPrimary';
  lookupLabel: (word: string) => string;
  onSelect: (word: string, caption: string) => void;
}) {
  return (
    <View className="flex-row flex-wrap items-center justify-center">
      {captionWords(caption).map((part, index) =>
        part.word ? (
          <TextButton
            key={index}
            tone={tone}
            variant="langLine"
            label={part.text}
            accessibilityLabel={lookupLabel(part.text)}
            onPress={() => onSelect(part.text, caption)}
          />
        ) : part.text.trim() ? (
          <Text key={index} variant="langLine" tone={tone}>
            {part.text.trim()}
          </Text>
        ) : null,
      )}
    </View>
  );
}
