import type { ReactNode } from 'react';
import { View } from 'react-native';
import { size } from '@konvami/design-tokens';
import { Icon, type IconName } from '@/components/icon';
import { Text } from '@/components/text';
import { Tile, type TileColor } from '@/components/tile';
import { useTheme } from '@/theme';

// The round chip behind the hero's icon (pt).
const ICON_CHIP = 52;

/**
 * The top of a feature's screen as a v4 colour block: the screen's title and what it is for on
 * the feature's colour (talking tomato, words pink, level and goals forest, asking ink), with the
 * feature's icon in a chip. `children` adds a line of the learner's own numbers under it.
 */
export function PageHero({
  color: look,
  icon,
  title,
  body,
  children,
}: {
  color: Exclude<TileColor, 'card'>;
  icon: IconName;
  title: string;
  /** What the screen is for: a sentence, or text with parts in bold (`<Trans>`, `tone="inherit"`). */
  body?: ReactNode;
  children?: ReactNode;
}) {
  const { color } = useTheme();
  const ink = {
    tomato: color.onTomato,
    forest: color.lime,
    butter: color.onButter,
    pink: color.onPink,
    ink: color.inverseAccent,
  }[look];
  const tone = {
    tomato: 'onTomato',
    forest: 'onForest',
    butter: 'onButter',
    pink: 'onPink',
    ink: 'onInverse',
  } as const;
  const chip = look === 'forest' ? 'bg-veil-light' : look === 'ink' ? 'bg-inverse-veil' : 'bg-veil';
  return (
    <Tile color={look} bubble="top-right" className="gap-3">
      <View
        aria-hidden
        style={{ width: ICON_CHIP, height: ICON_CHIP }}
        className={`items-center justify-center rounded-pill ${chip}`}
      >
        <Icon name={icon} color={ink} size={size.iconLg} strokeWidth={2.2} />
      </View>
      <View className="gap-1.5">
        <Text variant="title" tone={tone[look]} accessibilityRole="header">
          {title}
        </Text>
        {body ? <Text tone={tone[look]}>{body}</Text> : null}
      </View>
      {children}
    </Tile>
  );
}
