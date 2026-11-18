import { View, type PressableProps } from 'react-native';
import { PressScale } from '@/components/motion';
import { Text } from '@/components/text';
import type { TypeToken } from '@konvami/design-tokens';
import { useTileInk } from '@/components/tile';

/**
 * A quiet text-only action ("Skip", "Not now"). Keeps the 44 pt touch target however short the
 * label is. `primary` is for the alternative to a screen's main button.
 */
export function TextButton({
  label,
  tone = 'muted',
  variant = 'label',
  ...rest
}: Omit<PressableProps, 'children' | 'style'> & {
  label: string;
  /** The type style: `label`, or the serif `langLine` for a word of the language learned. */
  variant?: TypeToken;
  tone?: 'muted' | 'primary' | 'onPrimary';
}) {
  // On a colour block a quiet action takes the block's text colour, underlined to read as a link.
  const tile = useTileInk();
  return (
    <PressScale accessibilityRole="button" accessibilityLabel={label} {...rest}>
      <View className="min-h-tap min-w-tap items-center justify-center px-3.5">
        <Text
          variant={variant}
          tone={tile ? tile.tone : tone}
          className={tile ? 'text-center underline' : 'text-center'}
        >
          {label}
        </Text>
      </View>
    </PressScale>
  );
}
