import { useMemo } from 'react';
import { View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { motion } from '@konvami/design-tokens';
import { Button } from '@/components/button';
import { Icon, type IconName } from '@/components/icon';
import { Animate, Pop } from '@/components/motion';
import { Sheet } from '@/components/sheet';
import { Text } from '@/components/text';
import { Tile } from '@/components/tile';
import { burstKeyframes, burstOffset } from '@/lib/motion';
import { useTheme, type ColorToken } from '@/theme';

// How many pieces a burst throws, and their size (pt): enough to read as a burst, few enough to
// stay light on a small phone.
const PIECES = 12;
const PIECE = 10;
// The box the burst flies in (pt): twice the reach, so no piece leaves it.
const BURST_BOX = 2 * motion.burstReach + PIECE;
// The badge in the middle of the moment (pt).
const BADGE = 88;
// The glyph on that badge (pt): big enough to read as the moment's picture.
const BADGE_GLYPH = 40;

/** The v4 colour blocks the pieces take, in turn: never red, never a warning. */
const PIECE_COLORS: readonly ColorToken[] = ['tomato', 'butter', 'pink', 'lime'];

/** A burst of colour pieces from the middle, once. Decorative: hidden and untouchable. */
export function Burst() {
  const { color } = useTheme();
  const reduced = useReducedMotion();
  const pieces = useMemo(
    () =>
      Array.from({ length: PIECES }, (_, i) => {
        const { x, y } = burstOffset(i, PIECES);
        return { key: i, keyframes: burstKeyframes(x, y, reduced) };
      }),
    [reduced],
  );
  return (
    <View
      aria-hidden
      pointerEvents="none"
      style={{ width: BURST_BOX, height: BURST_BOX, position: 'absolute' }}
    >
      {pieces.map(({ key, keyframes }) => (
        <Animate
          key={key}
          keyframes={keyframes}
          duration={motion.burst}
          style={{
            position: 'absolute',
            left: BURST_BOX / 2 - PIECE / 2,
            top: BURST_BOX / 2 - PIECE / 2,
          }}
        >
          <View
            style={{
              width: PIECE,
              height: key % 3 === 0 ? PIECE / 2 : PIECE,
              borderRadius: key % 2 === 0 ? PIECE / 2 : 2,
              backgroundColor: color[PIECE_COLORS[key % PIECE_COLORS.length] ?? 'butter'],
            }}
          />
        </Animate>
      ))}
    </View>
  );
}

/**
 * A moment to celebrate (a quest done, a milestone reached), as a sheet: a badge pops in on the
 * butter block while colour pieces burst around it, with what was reached in words. Shown once;
 * the screen that opens it gives the haptic at the same moment.
 */
export function Celebration({
  visible,
  title,
  name,
  glyph,
  closeLabel,
  onClose,
}: {
  visible: boolean;
  /** "Quest done!" or "Milestone reached!". */
  title: string;
  /** What was done or reached. */
  name: string;
  glyph: IconName;
  closeLabel: string;
  onClose: () => void;
}) {
  const { color } = useTheme();
  return (
    <Sheet visible={visible} title={title} icon="award" onClose={onClose}>
      <View className="items-center gap-4 pb-2">
        <View
          className="items-center justify-center"
          style={{ width: BURST_BOX, height: BURST_BOX }}
        >
          {visible ? <Burst /> : null}
          <Pop>
            <Tile
              color="butter"
              className="items-center justify-center p-0"
              style={{ width: BADGE, height: BADGE }}
            >
              <Icon name={glyph} color={color.onButter} size={BADGE_GLYPH} />
            </Tile>
          </Pop>
        </View>
        <Text variant="title" className="text-center">
          {name}
        </Text>
        <Button label={closeLabel} onPress={onClose} />
      </View>
    </Sheet>
  );
}
