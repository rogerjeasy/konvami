import { View } from 'react-native';
import { size } from '@konvami/design-tokens';
import { PressScale } from '@/components/motion';

// The ring around the chosen color stands this far outside it (pt).
const RING_GAP = 3;

/**
 * One color among a few, as a round swatch (a partner's skin, hair or clothing). For one-of-many
 * inside a wrapping row; the row carries `accessibilityRole="radiogroup"`. The chosen one gets a
 * ring, so the choice does not depend on telling colors apart.
 */
export function Swatch({
  label,
  color,
  selected,
  onPress,
}: {
  /** The color's name, for screen readers. */
  label: string;
  /** A palette color from the design tokens. */
  color: string;
  selected: boolean;
  onPress: () => void;
}) {
  const ring = size.swatch + RING_GAP * 2;
  return (
    <PressScale
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected }}
      onPress={onPress}
    >
      <View className="min-h-tap min-w-tap items-center justify-center">
        <View
          style={{ width: ring, height: ring }}
          className={`items-center justify-center rounded-pill border-2 ${
            selected ? 'border-primary' : 'border-transparent'
          }`}
        >
          <View
            style={{ width: size.swatch, height: size.swatch, backgroundColor: color }}
            // An outline, so a dark color stays visible on a dark screen and a pale one on a light one.
            className="rounded-pill border border-field-border"
          />
        </View>
      </View>
    </PressScale>
  );
}
