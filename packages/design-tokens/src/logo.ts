import { brand } from './tokens.ts';

/**
 * The Konvami logo (v2: solid teal tile, no gradient): a smiling speech bubble with a pink tongue.
 * Geometry lives here once; the app's SVG components and scripts/export-brand-assets.ts both draw
 * from it, so the icon files and the in-app logo can never drift apart.
 */

/** The mark is drawn on a 120×120 grid. */
export const LOGO_GRID = 120;
/** The bubble's tight bounds on that grid (used when the mark is drawn without its tile). */
export const MARK_VIEWBOX = '11 10 98 98';
/** Corner radius of the rounded app-icon tile on the 120 grid (marketing use; stores mask their own). */
export const TILE_RADIUS = 27;

export const logoPaths = {
  bubble:
    'M60 26 c20 0 36 13 36 30 s-16 30 -36 30 c-5 0 -10 -0.8 -14 -2.2 L28 92 l6 -14 C28 72 24 64.5 24 56 c0 -17 16 -30 36 -30z',
  eyes: [
    { cx: 49, cy: 50, r: 4.3 },
    { cx: 71, cy: 50, r: 4.3 },
  ],
  tongue:
    'M60 66 c-4.6 0 -7 2.8 -7 6.2 c0 3.9 3.3 6.3 7 6.3 s7 -2.4 7 -6.3 c0 -3.4 -2.4 -6.2 -7 -6.2z',
  tongueLine: 'M60 68.5 v6',
  smile: 'M46 60 Q60 72 74 60',
  tongueLineWidth: 1.6,
  smileWidth: 4.5,
} as const;

/** The "Konvami" wordmark (Lexend SemiBold, outlined), one path. */
export const WORDMARK_VIEWBOX = { minX: 71, minY: -812, width: 4316, height: 842 } as const;
export const wordmarkPath =
  'M204.3 -206.9 172.3 -343.1 526.1 -700H708.1ZM91 0V-700H241V0ZM545.3 0 282.7 -347.5 386.1 -436.7 723.1 0Z M1043.9 10Q963.1 10 899.6 -25.7Q836.2 -61.4 799.7 -123.3Q763.1 -185.2 763.1 -264.9Q763.1 -344.7 799.7 -406.6Q836.2 -468.5 899.6 -504.2Q963.1 -539.9 1043.9 -539.9Q1124.2 -539.9 1187.4 -504.2Q1250.7 -468.5 1287 -406.6Q1323.4 -344.7 1323.4 -264.9Q1323.4 -185.2 1287 -123.3Q1250.7 -61.4 1187.4 -25.7Q1124.2 10 1043.9 10ZM1043.9 -113.6Q1083.2 -113.6 1114.1 -133.4Q1145.1 -153.2 1162.6 -187.4Q1180.1 -221.7 1179.5 -264.9Q1180.1 -309.2 1162.6 -343.4Q1145.1 -377.7 1114.1 -397.2Q1083.2 -416.7 1043.9 -416.7Q1004.3 -416.7 973.1 -396.9Q941.8 -377.1 924.1 -342.8Q906.4 -308.6 907 -264.9Q906.4 -221.7 924.1 -187.4Q941.8 -153.2 973.1 -133.4Q1004.3 -113.6 1043.9 -113.6Z M1421.2 0V-528.9H1557.3L1561.2 -420.9L1533.4 -408.9Q1543.8 -445.1 1572.6 -474.6Q1601.4 -504.1 1641.4 -522Q1681.4 -539.9 1724.6 -539.9Q1784.6 -539.9 1825.4 -515.8Q1866.2 -491.7 1886.8 -443.5Q1907.3 -395.3 1907.3 -323.9V0H1765.4V-313Q1765.4 -349.1 1755.4 -372.9Q1745.3 -396.8 1724.6 -408.1Q1703.9 -419.5 1673.9 -418.3Q1649.7 -418.3 1629.6 -410.7Q1609.4 -403.2 1594.6 -389.3Q1579.8 -375.4 1571.5 -357.4Q1563.1 -339.3 1563.1 -318V0H1492.7Q1469.9 0 1452.1 0Q1434.2 0 1421.2 0Z M2199.4 0 1977.4 -528.9H2133.1L2274.1 -133.6L2241.4 -128.1L2388.7 -528.9H2541.4L2308.4 0Z M2815.9 9.6Q2750.2 9.6 2697.2 -26.2Q2644.3 -62 2613.1 -124.2Q2581.9 -186.4 2581.9 -265.6Q2581.9 -345.7 2613.2 -407.6Q2644.6 -469.5 2698.9 -504.7Q2753.2 -539.9 2822.2 -539.9Q2861.3 -539.9 2893.7 -528.7Q2926.2 -517.4 2950.7 -497.3Q2975.2 -477.2 2991.9 -450.9Q3008.6 -424.7 3015.7 -394.6L2985.7 -399.9V-528.9H3126.7V0H2983.8V-127.3L3015.9 -130.1Q3008.4 -102.3 2990.3 -77Q2972.2 -51.7 2945.4 -32.4Q2918.7 -13.2 2885.9 -1.8Q2853.2 9.6 2815.9 9.6ZM2855 -112.6Q2895 -112.6 2925 -131.7Q2954.9 -150.8 2971.6 -185.3Q2988.2 -219.8 2988.2 -265.6Q2988.2 -310.7 2971.6 -345.1Q2954.9 -379.4 2925 -398.6Q2895 -417.7 2855 -417.7Q2815.6 -417.7 2786.1 -398.6Q2756.7 -379.4 2740.1 -345.1Q2723.4 -310.7 2723.4 -265.6Q2723.4 -219.8 2740.1 -185.3Q2756.7 -150.8 2786.1 -131.7Q2815.6 -112.6 2855 -112.6Z M3258 0V-528.9H3394.7L3397.8 -427.8L3377.2 -423.6Q3387.9 -449.6 3406.2 -470.6Q3424.5 -491.7 3448.6 -506.9Q3472.8 -522.1 3499.8 -530.4Q3526.7 -538.7 3553.8 -538.7Q3594.9 -538.7 3627.8 -525.8Q3660.6 -512.9 3683.8 -485.3Q3706.9 -457.6 3719.7 -412.6L3697.8 -415.4L3705.2 -431.3Q3717.8 -455.4 3737.9 -475Q3757.9 -494.5 3782.9 -508.9Q3807.9 -523.4 3835.2 -531Q3862.4 -538.7 3888.2 -538.7Q3949.9 -538.7 3991 -514.3Q4032 -489.9 4052.7 -441.1Q4073.3 -392.3 4073.3 -320.8V0H3930.8V-310.6Q3930.8 -346.6 3921.1 -369.9Q3911.3 -393.1 3892 -404.8Q3872.7 -416.4 3843.3 -416.4Q3820.4 -416.4 3800.6 -408.9Q3780.7 -401.3 3766.4 -387.4Q3752.1 -373.6 3744.1 -355.5Q3736 -337.5 3736 -315.6V0H3593.5V-311.8Q3593.5 -345.4 3583.4 -368.6Q3573.4 -391.9 3554.1 -404.2Q3534.8 -416.4 3507.2 -416.4Q3484.3 -416.4 3464.8 -408.9Q3445.2 -401.3 3430.9 -387.7Q3416.6 -374.2 3408.6 -356.1Q3400.5 -338.1 3400.5 -316.8V0Z M4209.8 0V-528.9H4351.7V0ZM4280 -637.5Q4238.8 -637.5 4216 -657.6Q4193.1 -677.7 4193.1 -714.6Q4193.1 -748.6 4216.5 -770.1Q4239.8 -791.6 4280 -791.6Q4321.2 -791.6 4344 -771.5Q4366.9 -751.4 4366.9 -714.6Q4366.9 -680.5 4343.5 -659Q4320.2 -637.5 4280 -637.5Z';

/** Width / height of the wordmark, to size it from a height. */
export const WORDMARK_ASPECT = WORDMARK_VIEWBOX.width / WORDMARK_VIEWBOX.height;

type MarkOptions = {
  /** Draw the teal tile behind the mark (app icon) or leave it transparent (splash, on-dark). */
  tile?: 'square' | 'rounded' | 'none';
  /** Scale of the mark inside the canvas, 1 = as on the app icon. Android adaptive icons need ~0.66. */
  scale?: number;
};

/** Full-color mark as an SVG document (for the icon export script and the web). */
export function markSvg({ tile = 'none', scale = 1 }: MarkOptions = {}): string {
  const p = logoPaths;
  const c = LOGO_GRID / 2;
  const tileRect =
    tile === 'none'
      ? ''
      : `<rect width="${LOGO_GRID}" height="${LOGO_GRID}" rx="${tile === 'rounded' ? TILE_RADIUS : 0}" fill="${brand.tile}"/>`;
  const eyes = p.eyes
    .map((e) => `<circle cx="${e.cx}" cy="${e.cy}" r="${e.r}" fill="${brand.face}"/>`)
    .join('');
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${LOGO_GRID} ${LOGO_GRID}">`,
    tileRect,
    `<g transform="translate(${c} ${c}) scale(${scale}) translate(${-c} ${-c})">`,
    `<path d="${p.bubble}" fill="${brand.bubble}"/>`,
    eyes,
    `<path d="${p.tongue}" fill="${brand.tongue}"/>`,
    `<path d="${p.tongueLine}" stroke="${brand.tongueLine}" stroke-width="${p.tongueLineWidth}" stroke-linecap="round"/>`,
    `<path d="${p.smile}" fill="none" stroke="${brand.face}" stroke-width="${p.smileWidth}" stroke-linecap="round"/>`,
    '</g></svg>',
  ].join('');
}

/** Single-color mark with the face cut out (Android themed icon, notifications). */
export function monoMarkSvg({
  scale = 1,
  fill = '#FFFFFF',
}: { scale?: number; fill?: string } = {}): string {
  const p = logoPaths;
  const c = LOGO_GRID / 2;
  const eyes = p.eyes
    .map((e) => `<circle cx="${e.cx}" cy="${e.cy}" r="${e.r}" fill="#000"/>`)
    .join('');
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${LOGO_GRID} ${LOGO_GRID}">`,
    `<mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="${LOGO_GRID}" height="${LOGO_GRID}">`,
    `<g transform="translate(${c} ${c}) scale(${scale}) translate(${-c} ${-c})">`,
    `<path d="${p.bubble}" fill="#fff"/>`,
    eyes,
    `<path d="${p.tongue}" fill="#000"/>`,
    `<path d="${p.smile}" fill="none" stroke="#000" stroke-width="${p.smileWidth}" stroke-linecap="round"/>`,
    '</g></mask>',
    `<rect width="${LOGO_GRID}" height="${LOGO_GRID}" fill="${fill}" mask="url(#m)"/>`,
    '</svg>',
  ].join('');
}

/** A solid square of one color (Android adaptive-icon background). */
export function solidSvg(fill: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${LOGO_GRID} ${LOGO_GRID}"><rect width="${LOGO_GRID}" height="${LOGO_GRID}" fill="${fill}"/></svg>`;
}
