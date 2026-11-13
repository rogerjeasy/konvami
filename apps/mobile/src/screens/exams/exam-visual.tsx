import { View } from 'react-native';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { Meter } from '@/components/meter';
import { Text } from '@/components/text';
import { useTheme } from '@/theme';

// Original scene geometry in one scalable drawing frame, independent of the screen width.
const FRAME = { width: 320, height: 200 };
const SCENE_PEOPLE = [92, 152, 218] as const;
const RAIN = [30, 64, 110, 146, 188, 226, 276] as const;
// All current TestDaF chart data are percentages, with a shared honest zero-to-100 scale.
const PERCENT = 100;

type Picture = 'waiting_room' | 'bus_stop';
interface Figure {
  title: string;
  labels: readonly string[];
  values: readonly number[];
}

function Scene({ picture }: { picture: Picture }) {
  const { color } = useTheme();
  const { t } = useTranslation();
  const waiting = picture === 'waiting_room';
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={t(`examStages.${picture}`)}
      style={{ width: '100%', aspectRatio: FRAME.width / FRAME.height }}
    >
      <Svg width="100%" height="100%" viewBox={`0 0 ${FRAME.width} ${FRAME.height}`} aria-hidden>
        <Rect width={FRAME.width} height={FRAME.height} rx="12" fill={color.surface} />
        <Path d="M12 176H308" stroke={color.border} strokeWidth="3" />
        {waiting ? (
          <>
            <Rect x="20" y="22" width="58" height="54" rx="6" fill={color.primarySoft} />
            <Path d="M49 34V64M34 49H64" stroke={color.primary} strokeWidth="7" />
            <Rect
              x="255"
              y="26"
              width="43"
              height="145"
              rx="4"
              fill={color.chip}
              stroke={color.border}
            />
            <Circle cx="265" cy="100" r="3" fill={color.fgMuted} />
            <Circle cx="193" cy="35" r="18" fill={color.chip} stroke={color.border} />
            <Path d="M193 24V35L202 40" stroke={color.fgMuted} strokeWidth="3" />
            <Path d="M68 133H238M75 133V169M231 133V169" stroke={color.fgMuted} strokeWidth="6" />
          </>
        ) : (
          <>
            <Path
              d="M66 40H249L264 53H54ZM67 53V174M250 53V174"
              fill={color.primarySoft}
              stroke={color.primary}
              strokeWidth="4"
            />
            <Rect
              x="273"
              y="44"
              width="30"
              height="38"
              rx="4"
              fill={color.primarySoft}
              stroke={color.primary}
            />
            <Path d="M288 82V175" stroke={color.fgMuted} strokeWidth="4" />
            <Rect x="280" y="53" width="16" height="18" rx="3" fill={color.primary} />
            <Path d="M282 58H294" stroke={color.onPrimary} strokeWidth="4" />
            <Circle cx="283" cy="73" r="2" fill={color.fgMuted} />
            <Circle cx="293" cy="73" r="2" fill={color.fgMuted} />
            {RAIN.map((x) => (
              <Path
                key={x}
                d={`M${x} 9l-5 12M${x + 8} 181l-5 9`}
                stroke={color.fgSubtle}
                strokeWidth="2"
              />
            ))}
          </>
        )}
        {SCENE_PEOPLE.map((x, index) => (
          <G key={x} transform={`translate(${x} ${index === 1 && waiting ? 18 : 0})`}>
            <Circle cx="0" cy="91" r={index === 1 && waiting ? 10 : 13} fill={color.fgMuted} />
            <Path
              d="M-14 111Q0 103 14 111L18 137H-18Z"
              fill={index === 0 ? color.primary : color.primarySoft}
              stroke={color.primary}
              strokeWidth="2"
            />
            <Path
              d={waiting ? 'M-10 136L-13 164M8 136L14 164' : 'M-10 136L-13 174M8 136L14 174'}
              stroke={color.fgMuted}
              strokeWidth="7"
              strokeLinecap="round"
            />
          </G>
        ))}
      </Svg>
    </View>
  );
}

/** The same picture/graph appears in preparation, the live task and its saved result. */
export function ExamVisual({
  picture,
  figure,
}: {
  picture?: Picture | null;
  figure?: Figure | null;
}) {
  const { i18n } = useTranslation();
  const percent = new Intl.NumberFormat(i18n.language, { style: 'percent' });
  return (
    <>
      {picture ? <Scene picture={picture} /> : null}
      {figure ? (
        <View className="gap-3">
          <Text variant="label">{figure.title}</Text>
          {figure.labels.map((label, index) => {
            const value = figure.values[index];
            if (value === undefined) return null;
            const formatted = percent.format(value / PERCENT);
            return (
              <View key={`${index}-${label}`} className="gap-1">
                <Text variant="small">{label}</Text>
                <Meter share={value / PERCENT} value={formatted} label={`${label}: ${formatted}`} />
              </View>
            );
          })}
        </View>
      ) : null}
    </>
  );
}
