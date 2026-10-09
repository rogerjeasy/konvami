import { View } from 'react-native';
import { size } from '@konvami/design-tokens';
import { Icon, type IconName } from '@/components/icon';
import { useTheme } from '@/theme';

// The glyph inside the tile (pt), as on the design.
const GLYPH = 32;

/** The soft rounded tile with an icon that leads a screen (verify email, forgot password). Decorative. */
export function IconTile({ icon }: { icon: IconName }) {
  const { color } = useTheme();
  return (
    <View
      aria-hidden
      style={{ width: size.iconTile, height: size.iconTile }}
      className="items-center justify-center rounded-panel bg-primary-soft"
    >
      <Icon name={icon} color={color.primaryText} size={GLYPH} strokeWidth={1.8} />
    </View>
  );
}
