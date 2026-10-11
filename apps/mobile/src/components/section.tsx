import { useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { motion, size } from '@konvami/design-tokens';
import { Icon } from '@/components/icon';
import { Reveal } from '@/components/motion';
import { Pill } from '@/components/pill';
import { Text } from '@/components/text';
import { CSS_EASE_OUT } from '@/lib/motion';
import { useTheme } from '@/theme';

// How far the chevron of a folded section is turned (it points down while the section is open).
const FOLDED_TURN = '-90deg';

/**
 * A titled part of a screen: a small heading, an optional action at its end ("See all") and
 * the content under it.
 *
 * A `collapsible` section can be folded away by its heading, which is then a button that says
 * whether the section is open. `count` stands beside the title ("2"), and `tone="warn"` shows
 * the title as the amber chip the app uses for things to polish.
 */
export function Section({
  title,
  action,
  count,
  tone = 'default',
  collapsible = false,
  children,
}: {
  title: string;
  action?: ReactNode;
  /** How many things the section holds, shown beside its title. */
  count?: number;
  tone?: 'default' | 'warn';
  collapsible?: boolean;
  children: ReactNode;
}) {
  const { color } = useTheme();
  const [open, setOpen] = useState(true);
  const heading = (
    <View className="shrink flex-row items-center gap-2">
      {tone === 'warn' ? (
        <Pill
          tone="warn"
          label={title}
          leading={<Icon name="edit" color={color.warnText} size={size.iconSm} />}
        />
      ) : (
        <Text
          variant="overline"
          tone="subtle"
          accessibilityRole={collapsible ? undefined : 'header'}
          className="shrink"
        >
          {title}
        </Text>
      )}
      {count === undefined ? null : (
        <Text variant="captionStrong" tone="subtle">
          {count}
        </Text>
      )}
    </View>
  );

  if (!collapsible) {
    return (
      <View className="gap-2.5">
        <View className="flex-row items-center justify-between gap-3">
          {heading}
          {action}
        </View>
        {children}
      </View>
    );
  }
  return (
    <View className="gap-1">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={count === undefined ? title : `${title}, ${count}`}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((shown) => !shown)}
        className="min-h-tap flex-row items-center justify-between gap-3 active:opacity-pressed"
      >
        {heading}
        <Animated.View
          aria-hidden
          style={{
            transform: [{ rotate: open ? '0deg' : FOLDED_TURN }],
            transitionProperty: 'transform',
            transitionDuration: `${motion.fast}ms`,
            transitionTimingFunction: CSS_EASE_OUT,
          }}
        >
          <Icon name="chevronDown" color={color.fgSubtle} size={size.iconMd} />
        </Animated.View>
      </Pressable>
      {open ? <Reveal>{children}</Reveal> : null}
    </View>
  );
}
