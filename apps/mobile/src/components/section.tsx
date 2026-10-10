import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '@/components/text';

/**
 * A titled part of a screen: a small heading, an optional action at its end ("See all") and
 * the content under it.
 */
export function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <View className="gap-2.5">
      <View className="flex-row items-center justify-between gap-3">
        <Text variant="overline" tone="subtle" accessibilityRole="header" className="shrink">
          {title}
        </Text>
        {action}
      </View>
      {children}
    </View>
  );
}
