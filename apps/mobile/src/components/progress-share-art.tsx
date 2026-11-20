import { forwardRef } from 'react';
import Svg, { G, Rect, Text as SvgText } from 'react-native-svg';
import { fontFamily } from '@konvami/design-tokens';
import { useTheme } from '@/theme';

// The picture is drawn at the size of a portrait post (px), then scaled to fit its box.
const WIDTH = 1080;
const HEIGHT = 1350;
const MARGIN = 96;
const RADIUS = 72;
// The CEFR steps of the level path, as on Progress (A0 fills none).
const PATH = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
const STEP_GAP = 16;
const STEP_HEIGHT = 28;
// Type sizes inside the picture (px), from the v4 scale drawn large.
const TYPE = { heading: 64, number: 168, label: 40, step: 36, mark: 48 } as const;
// Where each part sits, from the top (px).
const ROW = { heading: 210, first: 470, second: 720, third: 970, path: 1130, mark: 1270 } as const;

export interface ShareNumbers {
  /** "My German with Konvami". */
  heading: string;
  /** The app's name, drawn as the wordmark. */
  appName: string;
  minutes: number;
  streakDays: number;
  milestones: number;
  level: string | null;
  labels: { minutes: string; streak: string; milestones: string };
  locale: string;
}

/**
 * The learner's progress as a picture to share on request (spec §6.15): minutes spoken, the
 * streak, milestones and the level path, on the forest block with lime numbers. Nothing in it
 * is personal beyond what the learner chooses to send: no name, no recording, no words of theirs.
 * Drawn with react-native-svg so the same picture is saved as an image on every platform.
 */
export const ProgressShareArt = forwardRef<Svg, { numbers: ShareNumbers }>(
  function ProgressShareArt({ numbers }, ref) {
    const { color } = useTheme();
    const number = new Intl.NumberFormat(numbers.locale);
    const reached = numbers.level ? PATH.indexOf(numbers.level as (typeof PATH)[number]) : -1;
    const stepWidth = (WIDTH - 2 * MARGIN - (PATH.length - 1) * STEP_GAP) / PATH.length;
    const stat = (y: number, value: number, label: string, ink: string) => (
      <G>
        <SvgText x={MARGIN} y={y} fill={ink} fontFamily={fontFamily.display} fontSize={TYPE.number}>
          {number.format(value)}
        </SvgText>
        <SvgText
          x={MARGIN}
          y={y + TYPE.label + 24}
          fill={color.onForest}
          fontFamily={fontFamily.bodyBold}
          fontSize={TYPE.label}
        >
          {label}
        </SvgText>
      </G>
    );
    return (
      <Svg
        ref={ref}
        width="100%"
        height="100%"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Rect x={0} y={0} width={WIDTH} height={HEIGHT} rx={RADIUS} fill={color.forest} />
        <SvgText
          x={MARGIN}
          y={ROW.heading}
          fill={color.onForest}
          fontFamily={fontFamily.display}
          fontSize={TYPE.heading}
        >
          {numbers.heading}
        </SvgText>
        {stat(ROW.first, numbers.minutes, numbers.labels.minutes, color.lime)}
        {stat(ROW.second, numbers.streakDays, numbers.labels.streak, color.butter)}
        {stat(ROW.third, numbers.milestones, numbers.labels.milestones, color.lime)}
        {PATH.map((step, i) => {
          const x = MARGIN + i * (stepWidth + STEP_GAP);
          return (
            <G key={step}>
              <Rect
                x={x}
                y={ROW.path}
                width={stepWidth}
                height={STEP_HEIGHT}
                rx={STEP_HEIGHT / 2}
                fill={i <= reached ? color.lime : color.veilLight}
              />
              <SvgText
                x={x}
                y={ROW.path + STEP_HEIGHT + TYPE.step + 8}
                fill={i === reached ? color.lime : color.onForest}
                fontFamily={fontFamily.bodyBold}
                fontSize={TYPE.step}
              >
                {step}
              </SvgText>
            </G>
          );
        })}
        <SvgText
          x={WIDTH - MARGIN}
          y={ROW.mark}
          textAnchor="end"
          fill={color.lime}
          fontFamily={fontFamily.display}
          fontSize={TYPE.mark}
        >
          {numbers.appName}
        </SvgText>
      </Svg>
    );
  },
);

/** Width over height of the picture, for the box that shows it. */
export const SHARE_ART_RATIO = WIDTH / HEIGHT;
