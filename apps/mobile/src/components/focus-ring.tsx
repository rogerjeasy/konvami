import type { ReactNode } from 'react';
import { View } from 'react-native';
import { radius } from '@konvami/design-tokens';
import { useTheme } from '@/theme';

// Width of the soft ring around a focused field (pt), as on the design.
const RING = 4;

/**
 * The soft ring drawn around a focused field. It always takes its space (as a transparent border
 * pulled back by a negative margin), so focusing a field never moves the layout.
 */
export function FocusRing({
  active,
  cornerRadius = radius.field,
  className,
  children,
}: {
  active: boolean;
  /** Corner radius of the field inside. */
  cornerRadius?: number;
  className?: string;
  children: ReactNode;
}) {
  const { color } = useTheme();
  return (
    <View
      className={className}
      style={{
        margin: -RING,
        borderWidth: RING,
        borderRadius: cornerRadius + RING,
        borderColor: active ? color.focus : 'transparent',
      }}
    >
      {children}
    </View>
  );
}
