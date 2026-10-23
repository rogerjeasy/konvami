import { View } from 'react-native';
import { size } from '@konvami/design-tokens';
import { Text } from '@/components/text';

/** A level ("B1") in a teal ring. Decorative: the text beside it always names the level. */
export function LevelBadge({ level }: { level: string }) {
  return (
    <View
      aria-hidden
      style={{ width: size.levelBadgeSm, height: size.levelBadgeSm }}
      className="items-center justify-center rounded-pill border-2 border-primary bg-primary-soft"
    >
      <Text variant="heading" tone="primary">
        {level}
      </Text>
    </View>
  );
}
