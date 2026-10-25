import type { ReactNode } from 'react';
import { View } from 'react-native';
import { size } from '@konvami/design-tokens';
import { Icon } from '@/components/icon';
import { PressScale } from '@/components/motion';
import { Text } from '@/components/text';
import type { DiffPart } from '@/lib/word-diff';
import { useTheme } from '@/theme';

/** The words of a sentence that changed, alone ("der"), or the whole of it when none did. */
const changedWords = (parts: readonly DiffPart[]) => {
  const changed = parts.filter((part) => part.changed).map((part) => part.text);
  return (changed.length ? changed : parts.map((part) => part.text)).join(' ');
};

/**
 * A mistake as a small chip under what the learner just said: the words they used and the
 * right ones ("der → dem"), in amber, never red (spec §14.3 "zero shame"). Tapping it shows
 * why. Only the words that changed are shown, so it stays short; the label says it in full.
 */
export function CorrectionChip({
  said,
  better,
  accessibilityLabel,
  accessibilityHint,
  onPress,
}: {
  said: readonly DiffPart[];
  better: readonly DiffPart[];
  accessibilityLabel: string;
  accessibilityHint: string;
  onPress: () => void;
}): ReactNode {
  const { color } = useTheme();
  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
    >
      <View className="min-h-tap flex-row items-center gap-2 self-start rounded-pill bg-warn-soft px-3.5 py-2">
        <Icon name="edit" color={color.warnIcon} size={size.iconSm} />
        <Text variant="labelSmall" tone="warn" className="shrink">
          <Text
            variant="labelSmall"
            tone="inherit"
            className="underline"
            style={{ textDecorationColor: color.warnMark }}
          >
            {changedWords(said)}
          </Text>
          {' → '}
          <Text variant="labelSmall" tone="inherit">
            {changedWords(better)}
          </Text>
        </Text>
      </View>
    </PressScale>
  );
}
