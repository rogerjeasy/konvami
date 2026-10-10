import { createContext, useContext, type ReactNode } from 'react';
import { Pressable, useWindowDimensions, View, type PressableProps } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { motion, size, space } from '@konvami/design-tokens';
import { Icon, type IconName } from '@/components/icon';
import { Text } from '@/components/text';
import { showAllTabLabels } from '@/lib/layout';
import { CSS_EASE_OUT } from '@/lib/motion';
import { useTheme } from '@/theme';

// The soft mark behind the open tab's icon (pt).
const MARK = { width: 44, height: 30 } as const;
// A tab on the side rail: tall enough for its icon and a name of two lines.
const RAIL_TAB_MIN_HEIGHT = 64;

/** Whether the bar stands at the side of the window (a rail) instead of along its bottom. */
const SideContext = createContext(false);

/**
 * The app's tab bar: along the bottom on phones, a rail at the side on wide windows (`side`).
 * It only draws; which tabs exist and what a press does comes from the navigator around it.
 */
export function TabBar({
  label,
  side,
  children,
}: {
  /** What a screen reader calls the bar ("Main navigation"). */
  label: string;
  side: boolean;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <SideContext.Provider value={side}>
      <View
        accessibilityRole="tablist"
        accessibilityLabel={label}
        className={side ? 'border-r border-border bg-bg' : 'border-t border-border bg-bg'}
        style={
          side
            ? {
                width: size.tabRailWidth + insets.left,
                paddingLeft: insets.left,
                paddingTop: insets.top + space.lg,
                gap: space.xs,
              }
            : {
                flexDirection: 'row',
                paddingBottom: insets.bottom,
                paddingHorizontal: space.xs,
              }
        }
      >
        {children}
      </View>
    </SideContext.Provider>
  );
}

/**
 * One tab: its icon over its name. The open tab is teal on a soft mark; switching tabs only
 * fades that mark, because tabs are used all day (AGENTS.md 2b.4).
 */
export function TabButton({
  icon,
  label,
  isFocused = false,
  ...rest
}: Omit<PressableProps, 'children' | 'style'> & {
  icon: IconName;
  label: string;
  /** Set by the navigator for the tab that is open. */
  isFocused?: boolean;
}) {
  const { color } = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const side = useContext(SideContext);
  const named = side || isFocused || showAllTabLabels({ width, fontScale });
  return (
    <Pressable
      {...rest}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: isFocused }}
      className="items-center justify-center gap-0.5 px-0.5 py-1.5 active:opacity-pressed"
      style={
        side
          ? { minHeight: RAIL_TAB_MIN_HEIGHT }
          : // As wide as its name needs, and an equal share of what is left over.
            { flexGrow: 1, minWidth: size.minTapTarget, minHeight: size.tabBarHeight }
      }
    >
      <View style={MARK} className="items-center justify-center">
        <Animated.View
          aria-hidden
          className="absolute inset-0 rounded-pill bg-primary-soft"
          style={{
            opacity: isFocused ? 1 : 0,
            transitionProperty: 'opacity',
            transitionDuration: `${motion.fast}ms`,
            transitionTimingFunction: CSS_EASE_OUT,
          }}
        />
        <Icon
          name={icon}
          color={isFocused ? color.primaryText : color.fgSubtle}
          size={size.iconMd}
          strokeWidth={isFocused ? 2.2 : 2}
        />
      </View>
      {named ? (
        <Text
          variant="captionStrong"
          tone={isFocused ? 'primary' : 'subtle'}
          className="text-center"
          aria-hidden
        >
          {label}
        </Text>
      ) : null}
    </Pressable>
  );
}
