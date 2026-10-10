import type { ReactNode } from 'react';
import { View } from 'react-native';
import { IconTile } from '@/components/icon-tile';
import type { IconName } from '@/components/icon';
import { Reveal } from '@/components/motion';
import { Text } from '@/components/text';
import { staggerDelay } from '@/lib/motion';

/**
 * What a screen shows when it has nothing to list yet: what will be here, in plain words, and
 * (when there is one) the action that fills it. Never a made-up number or a sample row.
 */
export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: IconName;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <View className="w-full max-w-content flex-1 items-center justify-center gap-5 self-center py-10">
      <Reveal>
        <IconTile icon={icon} />
      </Reveal>
      <Reveal delay={staggerDelay(1)}>
        <View className="items-center gap-2">
          <Text variant="heading" className="text-center">
            {title}
          </Text>
          <Text tone="muted" className="text-center">
            {body}
          </Text>
        </View>
      </Reveal>
      {action ? (
        <Reveal delay={staggerDelay(2)} style={{ alignSelf: 'stretch' }}>
          {action}
        </Reveal>
      ) : null}
    </View>
  );
}
