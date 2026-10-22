import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { motion, size } from '@konvami/design-tokens';
import { Animate } from '@/components/motion';
import { growKeyframes, staggerDelay } from '@/lib/motion';

// A bar with a value is never drawn shorter than this (pt): the smallest value must still be a bar.
const SHORTEST_BAR = 6;
// A bar without a value is a line on the baseline, so the chart still shows its place.
const EMPTY_BAR = 2;
// How strongly the bars that are not selected show: still read in both themes, one step back.
const QUIET_OPACITY = 0.45;
// The most bars that grow one after the other; later ones start together (a month has 31).
const STAGGERED_BARS = 12;

export interface ChartBar {
  key: string;
  value: number;
  /** What a screen reader hears for the bar ("Week of Oct 5: 12 minutes"). */
  label: string;
}

/**
 * One series of values as bars that grow from the baseline, in order, scaled to the largest.
 * `dense` puts many bars (the days of a month) close together. With `onSelect` the whole chart
 * is one control: a tap picks the bar under the finger, and a screen reader steps from bar to
 * bar (an adjustable control that says the selected bar's `label`). Bars too thin to be touch
 * targets of their own are never buttons.
 */
export function BarChart({
  bars,
  dense = false,
  selected,
  onSelect,
  label,
}: {
  bars: readonly ChartBar[];
  dense?: boolean;
  selected?: number | null;
  onSelect?: (index: number) => void;
  /** What the chart shows, for a screen reader (needed with `onSelect`). */
  label?: string;
}) {
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  const most = Math.max(...bars.map((bar) => bar.value), 0) || 1;
  const drawn = bars.map((bar, i) => {
    const height =
      bar.value > 0
        ? Math.max(SHORTEST_BAR, Math.round((bar.value / most) * size.chartHeight))
        : EMPTY_BAR;
    return (
      <View
        key={bar.key}
        accessible={!onSelect}
        accessibilityLabel={onSelect ? undefined : bar.label}
        style={{ height }}
        // The bar slides up inside its own box, which clips it until it is in place.
        className="flex-1 overflow-hidden rounded-sm"
      >
        <Bar
          height={height}
          order={Math.min(i, STAGGERED_BARS)}
          filled={bar.value > 0}
          quiet={selected != null && selected !== i}
          reduced={reduced}
        />
      </View>
    );
  });
  const rowClass = `flex-row items-end ${dense ? 'gap-0.5' : 'gap-2'}`;
  if (!onSelect) {
    return (
      <View style={{ height: size.chartHeight }} className={rowClass}>
        {drawn}
      </View>
    );
  }
  const step = (by: number) => {
    const from = selected ?? bars.length - 1;
    onSelect(Math.min(Math.max(from + by, 0), bars.length - 1));
  };
  return (
    <Pressable
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ text: selected != null ? bars[selected]?.label : undefined }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(event) => step(event.nativeEvent.actionName === 'increment' ? 1 : -1)}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      onPress={(event) => {
        if (width <= 0 || bars.length === 0) return;
        const at = Math.floor((event.nativeEvent.locationX / width) * bars.length);
        onSelect(Math.min(Math.max(at, 0), bars.length - 1));
      }}
      style={{ height: size.chartHeight }}
      className={rowClass}
    >
      {drawn}
    </Pressable>
  );
}

function Bar({
  height,
  order,
  filled,
  quiet,
  reduced,
}: {
  height: number;
  order: number;
  filled: boolean;
  quiet: boolean;
  reduced: boolean;
}) {
  const grow = useMemo(() => growKeyframes(height, reduced), [height, reduced]);
  return (
    <Animate
      keyframes={grow}
      duration={motion.slow}
      delay={motion.enter + staggerDelay(order)}
      style={{ flex: 1 }}
    >
      <View
        style={filled && quiet ? { opacity: QUIET_OPACITY } : undefined}
        className={`flex-1 rounded-sm ${filled ? 'bg-primary' : 'bg-track'}`}
      />
    </Animate>
  );
}
