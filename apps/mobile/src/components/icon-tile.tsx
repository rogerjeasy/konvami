import { View } from 'react-native';
import { size } from '@konvami/design-tokens';
import { Icon, type IconName } from '@/components/icon';
import { blobFor } from '@/components/list';
import { useTheme } from '@/theme';

// The glyph inside the tile (pt), as on the design.
const GLYPH = 32;

/**
 * The rounded colour block with an icon that leads a screen (verify email, an empty list).
 * Decorative. Each icon takes the same v4 block as it does in a list row.
 */
export function IconTile({ icon }: { icon: IconName }) {
  const { color } = useTheme();
  const blob = blobFor(icon);
  return (
    <View
      aria-hidden
      style={{ width: size.iconTile, height: size.iconTile }}
      className={`items-center justify-center rounded-panel ${blob.box}`}
    >
      <Icon name={icon} color={color[blob.ink]} size={GLYPH} strokeWidth={2} />
    </View>
  );
}
