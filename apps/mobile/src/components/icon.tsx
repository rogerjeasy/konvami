import { View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { size as sizes } from '@konvami/design-tokens';

/** Stroke icons on a 24 grid (Feather-style, 2 pt stroke). Add new ones here, never inline. */
const ICONS = {
  globe: (
    <>
      <Circle cx="12" cy="12" r="10" />
      <Path d="M2 12h20" />
      <Path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </>
  ),
  chevronDown: <Path d="M6 9l6 6 6-6" />,
  arrowLeft: <Path d="M19 12H5M12 19l-7-7 7-7" />,
  chevronLeft: <Path d="M15 18l-6-6 6-6" />,
  lock: (
    <>
      <Rect x="3" y="11" width="18" height="11" rx="2" />
      <Path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </>
  ),
  shield: <Path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
  mail: (
    <>
      <Rect x="2" y="4" width="20" height="16" rx="3" />
      <Path d="M22 7l-10 7L2 7" />
    </>
  ),
  eye: (
    <>
      <Path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <Circle cx="12" cy="12" r="3" />
    </>
  ),
  eyeOff: (
    <>
      <Path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <Path d="M1 1l22 22" />
    </>
  ),
  mic: (
    <>
      <Rect x="9" y="2" width="6" height="12" rx="3" />
      <Path d="M19 10v1a7 7 0 0 1-14 0v-1" />
      <Path d="M12 18v4" />
    </>
  ),
  volume: (
    <>
      <Path d="M11 5L6 9H2v6h4l5 4V5z" />
      <Path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <Path d="M19 5a10 10 0 0 1 0 14" />
    </>
  ),
  file: (
    <>
      <Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <Path d="M14 2v6h6" />
      <Path d="M8 13h8" />
      <Path d="M8 17h5" />
    </>
  ),
  clock: (
    <>
      <Circle cx="12" cy="12" r="10" />
      <Path d="M12 6v6l4 2" />
    </>
  ),
  keyboard: (
    <>
      <Rect x="2" y="6" width="20" height="12" rx="2" />
      <Path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8" />
    </>
  ),
  gift: (
    <>
      <Path d="M20 12v10H4V12" />
      <Path d="M2 7h20v5H2z" />
      <Path d="M12 22V7" />
      <Path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
      <Path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
    </>
  ),
  externalLink: (
    <>
      <Path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <Path d="M15 3h6v6" />
      <Path d="M10 14L21 3" />
    </>
  ),
  alert: (
    <>
      <Circle cx="12" cy="12" r="10" />
      <Path d="M12 8v4" />
      <Path d="M12 16h.01" />
    </>
  ),
  link: (
    <>
      <Path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <Path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </>
  ),
  key: (
    <>
      <Circle cx="7.5" cy="15.5" r="5.5" />
      <Path d="M21 2l-9.6 9.6" />
      <Path d="M15.5 7.5l3 3L22 7l-3-3" />
    </>
  ),
  send: (
    <>
      <Path d="M22 2L11 13" />
      <Path d="M22 2l-7 20-4-9-9-4z" />
    </>
  ),
  faceId: (
    <>
      <Path d="M7 3H5a2 2 0 0 0-2 2v2M17 3h2a2 2 0 0 1 2 2v2M7 21H5a2 2 0 0 1-2-2v-2M17 21h2a2 2 0 0 0 2-2v-2" />
      <Path d="M9 9v1M15 9v1M12 9v4h-1" />
      <Path d="M9 16c1.5 1 4.5 1 6 0" />
    </>
  ),
  info: (
    <>
      <Circle cx="12" cy="12" r="10" />
      <Path d="M12 16v-4" />
      <Path d="M12 8h.01" />
    </>
  ),
  close: <Path d="M18 6L6 18M6 6l12 12" />,
  check: <Path d="M20 6L9 17l-5-5" />,
  book: (
    <>
      <Path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <Path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </>
  ),
} as const;

/** Filled glyphs (no stroke). */
const FILLED = {
  play: <Path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z" />,
  flame: (
    <Path d="M12 2c1 3.5 5 5.8 5 11a5 5 0 0 1-10 0c0-2.4 1.2-3.9 2.4-5 .2 1.6 1 2.6 2.1 3C11 8.5 11.3 5 12 2z" />
  ),
} as const;

export type IconName = keyof typeof ICONS | keyof typeof FILLED;

/** Decorative by default: the control around an icon carries the accessible label. */
export function Icon({
  name,
  color,
  size = sizes.icon,
  strokeWidth = 2,
}: {
  name: IconName;
  color: string;
  size?: number;
  strokeWidth?: number;
}) {
  const filled = name in FILLED;
  return (
    <View aria-hidden style={{ width: size, height: size }}>
      <Svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill={filled ? color : 'none'}
        stroke={filled ? 'none' : color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {filled ? FILLED[name as keyof typeof FILLED] : ICONS[name as keyof typeof ICONS]}
      </Svg>
    </View>
  );
}
