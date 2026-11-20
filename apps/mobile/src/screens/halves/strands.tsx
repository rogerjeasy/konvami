import { View } from 'react-native';
import Svg, { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg';
import { Redirect, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { HalvesStrands } from '@konvami/api-client';
import { fontFamily } from '@konvami/design-tokens';
import { useSession } from '@/auth';
import { Badge } from '@/components/badge';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { LoadState } from '@/components/load-state';
import { Pop, Reveal } from '@/components/motion';
import { PageHero } from '@/components/page-hero';
import { HeaderButton } from '@/components/step-header';
import { StepLayout } from '@/components/step-layout';
import { Text } from '@/components/text';
import { Tile } from '@/components/tile';
import { useHalvesStrands } from '@/halves/services';
import { staggerDelay } from '@/lib/motion';
import { backOr } from '@/lib/navigation';
import { ROUTES } from '@/lib/routes';
import { MAP_BOUNDS, MAP_HEIGHT, MAP_WIDTH, project, strandPath } from '@/lib/strand-map';
import { useTheme } from '@/theme';

// The drawing's marks, in its own units.
const DOT = 5;
const ME_DOT = 8;
const LABEL = 11;
const LABEL_GAP = 8;
const STROKE = 2;
// Faint lines every this many degrees, so the dots sit on something.
const GRID_STEP = 6;

/**
 * The strand map as a drawing: a faint grid, the learner's place in lime, and a thread to each
 * person they played with, in tomato (butter for a duo). Decorative: the list under it says the
 * same in words for a screen reader.
 */
function StrandDrawing({ map }: { map: HalvesStrands }) {
  const { color } = useTheme();
  const me = map.me ? project(map.me.latitude, map.me.longitude) : null;
  const longitudes: number[] = [];
  for (let lon = MAP_BOUNDS.west + 1; lon < MAP_BOUNDS.east; lon += GRID_STEP) longitudes.push(lon);
  const latitudes: number[] = [];
  for (let lat = MAP_BOUNDS.south + 2; lat < MAP_BOUNDS.north; lat += GRID_STEP)
    latitudes.push(lat);
  const label = (x: number, y: number, text: string, ink: string) => (
    <SvgText
      x={x}
      y={y - LABEL_GAP}
      fill={ink}
      fontFamily={fontFamily.bodyBold}
      fontSize={LABEL}
      textAnchor="middle"
    >
      {text}
    </SvgText>
  );
  return (
    <View
      aria-hidden
      pointerEvents="none"
      className="w-full"
      style={{ aspectRatio: MAP_WIDTH / MAP_HEIGHT }}
    >
      <Svg width="100%" height="100%" viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}>
        <G opacity={0.25}>
          {longitudes.map((lon) => {
            const x = project(MAP_BOUNDS.south, lon).x;
            return (
              <Line
                key={`lon${lon}`}
                x1={x}
                y1={0}
                x2={x}
                y2={MAP_HEIGHT}
                stroke={color.onInverse}
              />
            );
          })}
          {latitudes.map((lat) => {
            const y = project(lat, MAP_BOUNDS.west).y;
            return (
              <Line
                key={`lat${lat}`}
                x1={0}
                y1={y}
                x2={MAP_WIDTH}
                y2={y}
                stroke={color.onInverse}
              />
            );
          })}
        </G>
        {map.strands.map((strand) => {
          const at = project(strand.point.latitude, strand.point.longitude);
          const ink = strand.duo ? color.butter : color.tomato;
          return (
            <G key={strand.codename}>
              {me ? (
                <Path
                  d={strandPath(me, at)}
                  stroke={ink}
                  strokeWidth={STROKE}
                  strokeLinecap="round"
                  fill="none"
                />
              ) : null}
              <Circle cx={at.x} cy={at.y} r={DOT} fill={ink} />
              {label(at.x, at.y, strand.point.label, color.onInverse)}
            </G>
          );
        })}
        {me ? (
          <G>
            <Circle cx={me.x} cy={me.y} r={ME_DOT} fill={color.lime} />
            {label(me.x, me.y, map.me?.label ?? '', color.lime)}
          </G>
        ) : null}
      </Svg>
    </View>
  );
}

/**
 * 7.14 The strand map: a thread from the learner's city to the city (or country) of each
 * person they played a case with, only where each chose to share one. Nothing finer than a
 * city, no AI stand-ins, and blocked people are left out.
 */
export function HalvesStrandsScreen() {
  const { t } = useTranslation();
  const { status } = useSession();
  const signedIn = status === 'signedIn';
  const { state, refresh } = useHalvesStrands(signedIn);

  if (!signedIn) return <Redirect href={ROUTES.welcome} />;
  const map = state.phase === 'ready' ? state.data : null;
  return (
    <StepLayout
      header={
        <View className="min-h-tap flex-row items-center">
          <HeaderButton
            icon="chevronLeft"
            label={t('common.back')}
            onPress={() => backOr(ROUTES.halves)}
          />
        </View>
      }
    >
      <Reveal>
        <PageHero
          color="tomato"
          icon="globe"
          title={t('halves.strands.title')}
          body={t('halves.strands.body')}
        />
      </Reveal>
      {!map ? (
        <LoadState
          failed={state.phase === 'failed'}
          loadingLabel={t('halves.strands.loading')}
          slowLabel={t('common.wakingUp')}
          failedLabel={t('halves.strands.failed')}
          retryLabel={t('common.retry')}
          onRetry={refresh}
        />
      ) : (
        <>
          <Pop delay={staggerDelay(1)}>
            <Tile color="ink" className="p-3">
              <StrandDrawing map={map} />
            </Tile>
          </Pop>
          {!map.me ? (
            <Reveal delay={staggerDelay(2)}>
              <View className="gap-2">
                <Text tone="muted">{t('halves.strands.meNone')}</Text>
                <Button
                  variant="secondary"
                  label={t('halves.settings')}
                  onPress={() => router.push(ROUTES.halvesSettings)}
                />
              </View>
            </Reveal>
          ) : null}
          {map.strands.length === 0 ? (
            <Reveal delay={staggerDelay(3)}>
              <Text tone="muted">{t('halves.strands.empty')}</Text>
            </Reveal>
          ) : (
            map.strands.map((strand, index) => (
              <Reveal key={strand.codename} delay={staggerDelay(3 + index)}>
                <Card className="min-h-tap flex-row flex-wrap items-center gap-2 p-4">
                  <View className="flex-1 gap-0.5">
                    <Text variant="labelMedium">{strand.codename}</Text>
                    <Text variant="small" tone="muted">
                      {strand.point.label} · {t('halves.strands.cases', { count: strand.cases })}
                    </Text>
                  </View>
                  {strand.duo ? <Badge label={t('halves.strands.duo')} tone="chip" /> : null}
                </Card>
              </Reveal>
            ))
          )}
          {map.unplaced > 0 ? (
            <Text variant="small" tone="muted">
              {t('halves.strands.unplaced', { count: map.unplaced })}
            </Text>
          ) : null}
        </>
      )}
    </StepLayout>
  );
}
