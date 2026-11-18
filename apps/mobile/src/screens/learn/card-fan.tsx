import { View } from 'react-native';

// Three blank cards fanned in the deck tile's corner (pt and degrees, from the v4 prototype).
const CARD = { width: 46, height: 60 } as const;
const FAN = [
  { rotate: '-16deg', left: 0, top: 8 },
  { rotate: '-3deg', left: 16, top: 2 },
  { rotate: '12deg', left: 32, top: 8 },
] as const;
const FAN_WIDTH = 80;
const FAN_INSET = 16;

/** The decorative fan of cards on the Learn deck tile: a deck, not a number. */
export function CardFan() {
  return (
    <View
      aria-hidden
      pointerEvents="none"
      style={{
        position: 'absolute',
        right: FAN_INSET,
        top: FAN_INSET,
        width: FAN_WIDTH,
        height: CARD.height + FAN_INSET,
      }}
    >
      {FAN.map((card) => (
        <View
          key={card.rotate}
          className="absolute rounded-md border-2 border-on-pink bg-brand-speech"
          style={{
            ...CARD,
            left: card.left,
            top: card.top,
            transform: [{ rotate: card.rotate }],
          }}
        />
      ))}
    </View>
  );
}
