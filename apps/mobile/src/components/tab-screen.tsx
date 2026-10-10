import type { ReactNode } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { space } from '@konvami/design-tokens';
import { Text } from '@/components/text';
import { useScreenLayout } from '@/hooks/use-screen-layout';
import { useTheme } from '@/theme';

/**
 * The layout of a screen that lives in a tab (Today, Talk, Library, Learn, Progress): content
 * that scrolls under the status bar's inset, inside the screen gutters, never wider than
 * `max-w-screen`. The tab bar is outside it, so nothing here has to make room for it.
 *
 * Pulling down reads the screen's data again when `onRefresh` is given.
 */
export function TabScreen({
  children,
  refreshing = false,
  onRefresh,
}: {
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { gutter } = useScreenLayout();
  const { color } = useTheme();
  return (
    <ScrollView
      className="flex-1 bg-bg"
      contentContainerStyle={{
        flexGrow: 1,
        paddingTop: insets.top + space.lg,
        paddingHorizontal: gutter,
        paddingBottom: space['4xl'],
      }}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={color.primary}
            colors={[color.primary]}
          />
        ) : undefined
      }
    >
      <View className="w-full max-w-screen flex-1 gap-6 self-center">{children}</View>
    </ScrollView>
  );
}

/** The top of a tab's screen: its title, a line above or below it, and a control at the end. */
export function TabHeader({
  title,
  overline,
  body,
  trailing,
}: {
  title: string;
  /** A small line above the title (the date on Today). */
  overline?: string;
  /** A sentence under the title. */
  body?: string;
  trailing?: ReactNode;
}) {
  return (
    <View className="flex-row items-start justify-between gap-3">
      <View className="flex-1 gap-1.5">
        {overline ? (
          <Text variant="overline" tone="subtle">
            {overline}
          </Text>
        ) : null}
        <Text variant="title" accessibilityRole="header">
          {title}
        </Text>
        {body ? <Text tone="muted">{body}</Text> : null}
      </View>
      {trailing}
    </View>
  );
}
