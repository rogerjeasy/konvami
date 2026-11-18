import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { PressScale } from '@/components/motion';
import { Text } from '@/components/text';
import { Tile } from '@/components/tile';

// The small fan of cards in the tile's corner (pt): one card's box and how far each turns.
const FAN_CARD = { width: 34, height: 44 } as const;
const FAN_TURNS = [-16, -3, 12] as const;
const FAN_SHIFT = 8;

/** Three cards fanned out, drawn as a picture of the deck (decorative). */
function Fan() {
  return (
    <View
      aria-hidden
      pointerEvents="none"
      className="absolute right-4 top-4"
      style={{ width: FAN_CARD.width + 2 * FAN_SHIFT, height: FAN_CARD.height }}
    >
      {FAN_TURNS.map((turn, i) => (
        <View
          key={turn}
          className="absolute rounded-md border-2 border-on-pink bg-chip"
          style={{
            left: FAN_SHIFT,
            width: FAN_CARD.width,
            height: FAN_CARD.height,
            transform: [{ translateX: (i - 1) * FAN_SHIFT }, { rotate: `${turn}deg` }],
          }}
        />
      ))}
    </View>
  );
}

/** Words waiting: the pink block. The count, big, and one tap to the review (5.11). */
export function CardsTile({ count, onPress }: { count: number; onPress: () => void }) {
  const { t } = useTranslation();
  const title = t('today.cards.title', { count });
  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={{ flex: 1 }}
    >
      <Tile color="pink" className="flex-1 gap-1">
        <Fan />
        <Text variant="numeral" tone="onPink" aria-hidden>
          {String(count)}
        </Text>
        <Text variant="labelSmall" tone="onPink">
          {title}
        </Text>
        <Text variant="small" tone="onPink">
          {t('today.cards.body')}
        </Text>
      </Tile>
    </PressScale>
  );
}
