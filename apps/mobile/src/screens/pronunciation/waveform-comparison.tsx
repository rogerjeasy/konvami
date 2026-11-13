import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/button';
import { Text } from '@/components/text';
import { waveformEnvelope } from '@/lib/waveform';
import { usePracticeServices } from '@/practice/services';
import { useTheme } from '@/theme';
import { canDecodeAudio, decodeAudio } from '@/voice/decoded-audio';
import type { SentenceRecording } from '@/voice/sentence-recorder';

// The drawing scales as a unit. Text remains outside the decorative SVG and can grow freely.
const DRAWING_WIDTH = 288;
const DRAWING_HEIGHT = 64;
const BAR_WIDTH = 3;
type Shape = { envelope: number[]; durationMs: number };

function Waveform({ shape, label }: { shape: Shape; label: string }) {
  const { t, i18n } = useTranslation();
  const { color } = useTheme();
  return (
    <View className="gap-1">
      <Text variant="labelMedium">{label}</Text>
      <Svg
        width="100%"
        height={DRAWING_HEIGHT}
        viewBox={`0 0 ${DRAWING_WIDTH} ${DRAWING_HEIGHT}`}
        aria-hidden
      >
        {shape.envelope.map((value, index) => {
          const x = ((index + 0.5) * DRAWING_WIDTH) / shape.envelope.length;
          const height = Math.max(1, value * DRAWING_HEIGHT);
          return (
            <Line
              key={index}
              x1={x}
              x2={x}
              y1={(DRAWING_HEIGHT - height) / 2}
              y2={(DRAWING_HEIGHT + height) / 2}
              stroke={color.primary}
              strokeWidth={BAR_WIDTH}
            />
          );
        })}
      </Svg>
      <Text variant="caption" tone="muted">
        {t('pronunciation.comparison.duration', {
          seconds: new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 }).format(
            shape.durationMs / 1000,
          ),
        })}
      </Text>
    </View>
  );
}

type ComparisonProps = { recording: SentenceRecording; reference: string };

/** A new recording gets a fresh session; stale decodes cannot replace the new comparison. */
export function WaveformComparison(props: ComparisonProps) {
  const [input, setInput] = useState({ ...props, revision: 0 });
  if (input.recording !== props.recording || input.reference !== props.reference) {
    setInput({ ...props, revision: input.revision + 1 });
  }
  return <ComparisonSession key={input.revision} {...props} />;
}

/** Local amplitude comparison only; it never produces a phoneme or rhythm score. */
function ComparisonSession({ recording, reference }: ComparisonProps) {
  const { t } = useTranslation();
  const { pronunciationSound } = usePracticeServices();
  const [state, setState] = useState<
    { kind: 'ready' | 'busy' | 'failed' } | { kind: 'compared'; yours: Shape; reference: Shape }
  >({ kind: 'ready' });
  const current = useRef({ generation: 0 });
  useEffect(() => {
    const lifetime = current.current;
    return () => {
      lifetime.generation++;
    };
  }, []);
  if (!canDecodeAudio()) return null;
  async function compare() {
    const request = ++current.current.generation;
    setState({ kind: 'busy' });
    try {
      const [yours, model] = await Promise.all([
        decodeAudio(recording),
        pronunciationSound(reference).then(decodeAudio),
      ]);
      if (request !== current.current.generation) return;
      setState({
        kind: 'compared',
        yours: { envelope: waveformEnvelope(yours.channels), durationMs: yours.durationMs },
        reference: { envelope: waveformEnvelope(model.channels), durationMs: model.durationMs },
      });
    } catch {
      if (request === current.current.generation) setState({ kind: 'failed' });
    }
  }
  return (
    <View className="gap-3">
      {state.kind === 'compared' ? (
        <>
          <Waveform label={t('pronunciation.comparison.yours')} shape={state.yours} />
          <Waveform label={t('pronunciation.comparison.reference')} shape={state.reference} />
          <Text variant="caption" tone="muted">
            {t('pronunciation.comparison.explanation')}
          </Text>
        </>
      ) : (
        <Button
          label={t('pronunciation.comparison.compare')}
          variant="secondary"
          disabled={state.kind === 'busy'}
          onPress={() => void compare()}
        />
      )}
      {state.kind === 'failed' ? (
        <Text tone="muted">{t('pronunciation.comparison.failed')}</Text>
      ) : null}
    </View>
  );
}
