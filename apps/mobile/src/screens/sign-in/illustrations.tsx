import { useWindowDimensions, View } from 'react-native';
import { Icon } from '@/components/icon';
import { Pop } from '@/components/motion';
import { useScreenLayout } from '@/hooks/use-screen-layout';
import { heroDrawingSize } from '@/lib/layout';
import { useTheme } from '@/theme';

/**
 * The two small drawings of the password-reset flow, on the design's frames and scaled to the
 * space available. Decorative: hidden from screen readers and from touches.
 */

// 3.6: a soft disc with a rounded "sent" tile on it.
const SENT = { frame: 192, tile: 100, glyph: 46 } as const;
// 3.8: a ring, a soft disc and the success disc with its check.
const DONE = { frame: 208, soft: 156, disc: 100, glyph: 46 } as const;

function useDrawing(frame: number) {
  const { illustrationWidth } = useScreenLayout();
  const { height: windowHeight } = useWindowDimensions();
  const side = heroDrawingSize({ frame, available: illustrationWidth, windowHeight });
  const k = side / frame;
  const centred = (diameter: number) => ({
    position: 'absolute' as const,
    width: diameter * k,
    height: diameter * k,
    left: ((frame - diameter) / 2) * k,
    top: ((frame - diameter) / 2) * k,
  });
  return { side, k, centred };
}

/** 3.6 · The reset email is on its way. */
export function SentIllustration() {
  const { color } = useTheme();
  const { side, k, centred } = useDrawing(SENT.frame);
  return (
    <View
      aria-hidden
      style={{ width: side, height: side, pointerEvents: 'none' }}
      className="self-center"
    >
      <View style={centred(SENT.frame)} className="rounded-pill bg-surface" />
      <Pop style={centred(SENT.tile)}>
        <View className="h-full w-full items-center justify-center rounded-hero bg-primary">
          <Icon name="send" color={color.onPrimary} size={SENT.glyph * k} strokeWidth={1.8} />
        </View>
      </Pop>
    </View>
  );
}

/** 3.8 · Done: the password is updated. */
export function DoneIllustration() {
  const { color } = useTheme();
  const { side, k, centred } = useDrawing(DONE.frame);
  return (
    <View
      aria-hidden
      style={{ width: side, height: side, pointerEvents: 'none' }}
      className="self-center"
    >
      <View style={centred(DONE.frame)} className="rounded-pill border border-border" />
      <View style={centred(DONE.soft)} className="rounded-pill bg-success-soft" />
      <Pop style={centred(DONE.disc)}>
        <View className="h-full w-full items-center justify-center rounded-pill bg-success">
          <Icon name="check" color={color.bg} size={DONE.glyph * k} strokeWidth={2.6} />
        </View>
      </Pop>
    </View>
  );
}
