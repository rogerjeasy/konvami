import { View } from 'react-native';
import { size } from '@konvami/design-tokens';
import { Text } from '@/components/text';

/**
 * A level ("B1") on a forest disc in lime: the colour the level owns in v4. `large` is the
 * placement result's. Decorative: the text beside it always names the level.
 */
export function LevelBadge({ level, large = false }: { level: string; large?: boolean }) {
  const side = large ? size.levelBadge : size.levelBadgeSm;
  return (
    <View
      aria-hidden
      style={{ width: side, height: side }}
      className="items-center justify-center rounded-pill bg-forest"
    >
      <Text variant={large ? 'stat' : 'heading'} tone="lime">
        {level}
      </Text>
    </View>
  );
}
