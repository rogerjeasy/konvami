import { forwardRef, useRef, useState } from 'react';
import { View } from 'react-native';
import type SvgRef from 'react-native-svg';
import Svg, { G, Path, Rect, Text as SvgText } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import type { HalvesShare } from '@konvami/api-client';
import { fontFamily } from '@konvami/design-tokens';
import { Button } from '@/components/button';
import { Sheet } from '@/components/sheet';
import { Text } from '@/components/text';
import { useHalvesApi } from '@/halves/services';
import { commitFeedback } from '@/lib/haptics';
import { shareSvgImage } from '@/lib/share-image';
import { useTheme } from '@/theme';

// The picture is drawn at the size of a portrait post (px), then scaled to fit its box.
const WIDTH = 1080;
const HEIGHT = 1350;
const MARGIN = 96;
const RADIUS = 72;
// The two halves of the disc at the top (px).
const DISC = 300;
const DISC_TOP = 150;
const DISC_GAP = 28;
const TYPE = { kicker: 40, title: 76, number: 200, label: 40, code: 48, mark: 48 } as const;
const ROW = { kicker: 590, title: 690, number: 960, label: 1030, code: 1160, mark: 1270 } as const;
// A long title is cut so it stays on one line of the picture.
const TITLE_MAX = 24;
// The box the picture is drawn in, so the web can find it, and the file's name.
const ART_ID = 'konvami-halves-card';
const FILE_NAME = 'konvami-two-halves';

interface CardWords {
  kicker: string;
  title: string;
  result: string;
  heard: string;
  code: string | null;
  appName: string;
}

/**
 * The case card as a picture (7.15): the two halves, the case, whether it was solved and how
 * many clues were understood the first time. No voice, no words of the learner, no name: their
 * codename is not on it either, only the invite code when they have one.
 */
const HalvesShareArt = forwardRef<SvgRef, { card: HalvesShare; words: CardWords }>(
  function HalvesShareArt({ card, words }, ref) {
    const { color } = useTheme();
    const middle = WIDTH / 2;
    const half = DISC / 2;
    const title =
      words.title.length > TITLE_MAX ? `${words.title.slice(0, TITLE_MAX - 1)}…` : words.title;
    return (
      <Svg
        ref={ref}
        width="100%"
        height="100%"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Rect x={0} y={0} width={WIDTH} height={HEIGHT} rx={RADIUS} fill={color.inverse} />
        <G>
          <Path
            d={`M${middle - DISC_GAP / 2} ${DISC_TOP} a${half} ${half} 0 0 0 0 ${DISC} z`}
            fill={color.tomato}
          />
          <Path
            d={`M${middle + DISC_GAP / 2} ${DISC_TOP} a${half} ${half} 0 0 1 0 ${DISC} z`}
            fill={color.lime}
          />
        </G>
        <SvgText
          x={MARGIN}
          y={ROW.kicker}
          fill={color.tomato}
          fontFamily={fontFamily.bodyBold}
          fontSize={TYPE.kicker}
        >
          {words.kicker}
        </SvgText>
        <SvgText
          x={MARGIN}
          y={ROW.title}
          fill={color.onInverse}
          fontFamily={fontFamily.display}
          fontSize={TYPE.title}
        >
          {title}
        </SvgText>
        <SvgText
          x={MARGIN}
          y={ROW.number}
          fill={color.lime}
          fontFamily={fontFamily.display}
          fontSize={TYPE.number}
        >
          {card.told > 0 ? `${card.understoodFirst}/${card.told}` : words.result}
        </SvgText>
        <SvgText
          x={MARGIN}
          y={ROW.label}
          fill={color.onInverse}
          fontFamily={fontFamily.bodyBold}
          fontSize={TYPE.label}
        >
          {card.told > 0 ? words.heard : ''}
        </SvgText>
        {words.code ? (
          <SvgText
            x={MARGIN}
            y={ROW.code}
            fill={color.butter}
            fontFamily={fontFamily.bodyBold}
            fontSize={TYPE.code}
          >
            {words.code}
          </SvgText>
        ) : null}
        <SvgText
          x={WIDTH - MARGIN}
          y={ROW.mark}
          textAnchor="end"
          fill={color.lime}
          fontFamily={fontFamily.display}
          fontSize={TYPE.mark}
        >
          {words.appName}
        </SvgText>
      </Svg>
    );
  },
);

/**
 * 7.15 Share the case card: read from the server when asked (it may make an invite code),
 * previewed in a sheet and shared only when the learner taps Share.
 */
export function ShareCaseCard({ caseId }: { caseId: string }) {
  const { t } = useTranslation();
  const api = useHalvesApi();
  const art = useRef<SvgRef>(null);
  const [card, setCard] = useState<HalvesShare | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function preview() {
    commitFeedback();
    setFailed(false);
    setOpen(true);
    try {
      setCard(await api.getHalvesShareCard(caseId));
    } catch {
      setFailed(true);
    }
  }

  async function share() {
    commitFeedback();
    setBusy(true);
    setFailed(false);
    try {
      await shareSvgImage(art.current, FILE_NAME, ART_ID);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  const words: CardWords | null = card
    ? {
        kicker: card.week ? t('halves.share.week') : t('halves.title'),
        title: card.title,
        result: card.status === 'solved' ? t('halves.share.solved') : t('halves.share.unsolved'),
        heard: t('halves.share.heard', { understood: card.understoodFirst, told: card.told }),
        code: card.code ? t('halves.share.code', { code: card.code }) : null,
        appName: t('common.appName'),
      }
    : null;
  return (
    <>
      <Button variant="secondary" label={t('halves.share.action')} onPress={() => void preview()} />
      <Sheet
        visible={open}
        title={t('halves.share.title')}
        icon="send"
        onClose={() => setOpen(false)}
      >
        <View className="gap-4">
          <Text tone="muted">{t('halves.share.body')}</Text>
          {card && words ? (
            <View nativeID={ART_ID} className="w-full" style={{ aspectRatio: WIDTH / HEIGHT }}>
              <HalvesShareArt ref={art} card={card} words={words} />
            </View>
          ) : null}
          {failed ? (
            <Text variant="small" tone="muted" accessibilityRole="alert">
              {t('halves.share.failed')}
            </Text>
          ) : null}
          <Button
            label={t('halves.share.send')}
            loading={busy}
            disabled={!card}
            onPress={() => void share()}
          />
        </View>
      </Sheet>
    </>
  );
}
