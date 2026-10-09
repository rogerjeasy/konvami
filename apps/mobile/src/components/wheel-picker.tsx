import { useEffect, useRef } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { size } from '@konvami/design-tokens';
import { Text } from '@/components/text';

/** Rows shown at once: the selected one in the middle, two above and two below. */
export const WHEEL_VISIBLE_ROWS = 5;
const ROWS_BEFORE = (WHEEL_VISIBLE_ROWS - 1) / 2;
// A programmatic scroll that never reports its end (interrupted) stops blocking after this (ms).
const SETTLE_TIMEOUT_MS = 600;

/** Height of one row. Rows grow with the OS text size so a label is never clipped. */
export function wheelRowHeight(fontScale: number): number {
  return Math.round(size.wheelRow * Math.max(fontScale, 1));
}

export interface WheelItem<T> {
  value: T;
  label: string;
}

/**
 * One column of a wheel (a day, a month, a year): scroll or tap to choose, and the row on the
 * centre line is the choice. Screen readers get an adjustable control with next / previous.
 * The parent draws the highlight band behind the centre row.
 */
export function WheelPicker<T extends string | number>({
  label,
  items,
  value,
  onChange,
}: {
  /** Accessible name ("Day"). */
  label: string;
  items: readonly WheelItem<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  const { fontScale } = useWindowDimensions();
  const row = wheelRowHeight(fontScale);
  const scroll = useRef<ScrollView>(null);
  const index = Math.max(
    items.findIndex((item) => item.value === value),
    0,
  );
  /**
   * The row the wheel is showing, or null before it has been positioned. We only move the wheel
   * ourselves when the value differs from this (it changed from outside, or at the start).
   */
  const shownIndex = useRef<number | null>(null);
  /** Set while we scroll the wheel ourselves: scroll events on the way are not the user's choice. */
  const settlingTo = useRef<number | null>(null);

  useEffect(() => {
    if (shownIndex.current === index) return;
    if (shownIndex.current === null) {
      // The first positioning jumps straight there (the web build ignores `contentOffset`), so
      // there is no glide whose scroll events would have to be told apart from the user's.
      shownIndex.current = index;
      scroll.current?.scrollTo({ y: index * row, animated: false });
      return;
    }
    settlingTo.current = index;
    scroll.current?.scrollTo({ y: index * row, animated: true });
    const timer = setTimeout(() => {
      settlingTo.current = null;
      shownIndex.current = index;
    }, SETTLE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [index, row]);

  function onScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const at = Math.round(event.nativeEvent.contentOffset.y / row);
    const next = Math.min(Math.max(at, 0), items.length - 1);
    if (settlingTo.current !== null) {
      if (next !== settlingTo.current) return;
      settlingTo.current = null;
    }
    shownIndex.current = next;
    const item = items[next];
    if (item && item.value !== value) onChange(item.value);
  }

  function step(by: 1 | -1) {
    const item = items[index + by];
    if (item) onChange(item.value);
  }

  return (
    // The window onto the wheel: exactly five rows tall, whatever the list's length.
    <View style={{ height: row * WHEEL_VISIBLE_ROWS }}>
      <ScrollView
        ref={scroll}
        testID={`wheel-${label}`}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ text: items[index]?.label }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(event) =>
          step(event.nativeEvent.actionName === 'increment' ? 1 : -1)
        }
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
        snapToInterval={row}
        decelerationRate="fast"
        scrollEventThrottle={16}
        onScroll={onScroll}
        contentOffset={{ x: 0, y: index * row }}
        contentContainerStyle={{ paddingVertical: row * ROWS_BEFORE }}
        // snapToInterval is native only; the web preview snaps with CSS.
        className={Platform.OS === 'web' ? 'flex-1 snap-y snap-mandatory' : 'flex-1'}
      >
        {items.map((item, i) => {
          const distance = Math.abs(i - index);
          return (
            <Pressable
              key={String(item.value)}
              onPress={() => onChange(item.value)}
              // The wheel as a whole is the control for screen readers; rows are not separate stops.
              accessible={false}
              style={{ height: row }}
              className={`items-center justify-center px-1 ${Platform.OS === 'web' ? 'snap-center' : ''}`}
            >
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                variant={distance === 0 ? 'wheel' : distance === 1 ? 'wheelNear' : 'body'}
                tone={distance === 0 ? 'fg' : 'subtle'}
                className={distance > 1 ? 'opacity-faded' : ''}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
