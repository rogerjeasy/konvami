import { useState } from 'react';
import { Image, View } from 'react-native';
import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import { useTheme } from '@/theme';
import type { TypeToken } from '@konvami/design-tokens';

// From this diameter (pt) the initial is set in the display face, like a title.
const LARGE_FROM = 72;
// The person glyph, as a share of the circle.
const GLYPH_RATIO = 0.45;

/**
 * The learner as a round picture: their photo, or the first letter of their name, or a person
 * when the account has no name. Decorative: the control or line around it says who it is.
 */
export function UserPhoto({
  uri,
  name,
  diameter,
}: {
  /** A (short-lived) address of the photo; null without one. */
  uri: string | null;
  /** The learner's first name; may be empty. */
  name: string;
  diameter: number;
}) {
  const { color } = useTheme();
  // The address that could not be loaded. A new address gets a new chance.
  const [brokenUri, setBrokenUri] = useState<string | null>(null);
  const broken = uri !== null && uri === brokenUri;

  const initial = name.trim().charAt(0).toLocaleUpperCase();
  const variant: TypeToken = diameter >= LARGE_FROM ? 'title' : 'label';
  return (
    <View
      aria-hidden
      style={{ width: diameter, height: diameter }}
      className="items-center justify-center overflow-hidden rounded-pill border border-border bg-primary-soft"
    >
      {uri && !broken ? (
        <Image
          testID="user-photo-image"
          source={{ uri }}
          onError={() => setBrokenUri(uri)}
          accessibilityIgnoresInvertColors
          style={{ width: diameter, height: diameter }}
        />
      ) : initial ? (
        <Text variant={variant} tone="primary">
          {initial}
        </Text>
      ) : (
        <Icon name="user" color={color.primaryText} size={Math.round(diameter * GLYPH_RATIO)} />
      )}
    </View>
  );
}
