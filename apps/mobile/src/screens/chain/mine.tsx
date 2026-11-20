import { useState } from 'react';
import { View } from 'react-native';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { ChainMine } from '@konvami/api-client';
import { size } from '@konvami/design-tokens';
import { useSession } from '@/auth';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Icon } from '@/components/icon';
import { LoadState } from '@/components/load-state';
import { Pop, Reveal } from '@/components/motion';
import { PageHero } from '@/components/page-hero';
import { HeaderButton } from '@/components/step-header';
import { StepLayout } from '@/components/step-layout';
import { Text } from '@/components/text';
import { useChainApi, useChainStory } from '@/chain/services';
import { successFeedback } from '@/lib/haptics';
import { staggerDelay } from '@/lib/motion';
import { backOr } from '@/lib/navigation';
import { chainStoryRoute, ROUTES } from '@/lib/routes';
import { diffWords } from '@/lib/word-diff';
import { PolishCard } from '@/screens/report/polish-card';
import { SayItBetterSheet } from '@/screens/report/say-it-better';
import { useTheme } from '@/theme';
import { LineBubble } from './parts';

// The narrowest the two buttons of a correction get side by side (pt); narrower, they stack.
const ACTION_MIN_WIDTH = 132;

/** The learner's sentence with one correction put in, to say again. */
function practiceSentence(said: string, original: string, corrected: string): string {
  return said.includes(original) ? said.replace(original, corrected) : corrected;
}

function LineNotes({
  line,
  saved,
  onSave,
  onRetry,
}: {
  line: ChainMine;
  saved: ReadonlySet<string>;
  onSave: (index: number) => Promise<void>;
  onRetry: (index: number) => void;
}) {
  const { t } = useTranslation();
  const { color } = useTheme();
  return (
    <Card className="gap-3 p-4">
      <LineBubble kind="line" name={t('chain.you')} text={line.transcript} mine />
      {line.corrections.length === 0 ? (
        <Pop>
          <Text tone="muted">{t('chain.mine.none')}</Text>
        </Pop>
      ) : (
        line.corrections.map((correction, index) => {
          const { before, after } = diffWords(correction.original, correction.corrected);
          const key = `${line.id}:${index}`;
          return (
            <PolishCard
              key={key}
              badge={correction.certain ? undefined : t('report.polish.unsure')}
              saidLabel={t('report.said')}
              said={before}
              betterLabel={t('report.better')}
              better={after}
              explanation={correction.explanation}
              note={correction.certain ? undefined : t('chain.mine.unsure')}
              accessibilityLabel={`${correction.original}, ${correction.corrected}. ${correction.explanation}`}
              action={
                // Only what the second check confirmed is worth saying again or keeping.
                correction.certain ? (
                  <View className="flex-row flex-wrap gap-2">
                    <View className="flex-1" style={{ minWidth: ACTION_MIN_WIDTH }}>
                      <Button
                        label={t('chain.mine.sayBetter')}
                        leading={<Icon name="mic" color={color.onPrimary} size={size.iconMd} />}
                        onPress={() => onRetry(index)}
                      />
                    </View>
                    <View className="flex-1" style={{ minWidth: ACTION_MIN_WIDTH }}>
                      <Button
                        variant="secondary"
                        label={saved.has(key) ? t('chain.mine.saved') : t('chain.mine.saveCard')}
                        disabled={saved.has(key)}
                        onPress={() => void onSave(index)}
                      />
                    </View>
                  </View>
                ) : undefined
              }
            />
          );
        })
      )}
    </Card>
  );
}

/**
 * 9.7 My lines, privately: what the learner said in this story and the corrections the second
 * check confirmed, to say better (as on 5.10) and to keep as cards. The other players never see
 * any of it.
 */
export function ChainMineScreen() {
  const { t } = useTranslation();
  const { status } = useSession();
  const signedIn = status === 'signedIn';
  const { id } = useLocalSearchParams<{ id: string }>();
  const api = useChainApi();
  const { state, refresh } = useChainStory(signedIn ? (id ?? null) : null);
  const [saved, setSaved] = useState<ReadonlySet<string>>(new Set());
  const [retrying, setRetrying] = useState<{ line: ChainMine; index: number } | null>(null);

  if (!signedIn) return <Redirect href={ROUTES.welcome} />;
  const story = state.phase === 'ready' ? state.data : null;
  const lines = story?.mine.filter((line) => line.status === 'delivered' && line.transcript) ?? [];

  async function save(line: ChainMine, index: number) {
    await api.saveChainCard(line.id, index);
    successFeedback();
    setSaved((now) => new Set(now).add(`${line.id}:${index}`));
  }

  const correction = retrying ? retrying.line.corrections[retrying.index] : undefined;
  return (
    <StepLayout
      header={
        <View className="min-h-tap flex-row items-center">
          <HeaderButton
            icon="chevronLeft"
            label={t('common.back')}
            onPress={() => backOr(id ? chainStoryRoute(id) : ROUTES.chain)}
          />
        </View>
      }
    >
      <Reveal>
        <PageHero
          color="pink"
          icon="lock"
          title={t('chain.mine.title')}
          body={t('chain.mine.body')}
        />
      </Reveal>
      {!story ? (
        <LoadState
          failed={state.phase === 'failed'}
          loadingLabel={t('chain.story.loading')}
          slowLabel={t('common.wakingUp')}
          failedLabel={t('chain.story.loadFailed')}
          retryLabel={t('common.retry')}
          onRetry={refresh}
        />
      ) : lines.length === 0 ? (
        <Text tone="muted">{t('chain.mine.empty')}</Text>
      ) : (
        lines.map((line, order) => (
          <Reveal key={line.id} delay={staggerDelay(order + 1)}>
            <LineNotes
              line={line}
              saved={saved}
              onSave={(index) => save(line, index)}
              onRetry={(index) => setRetrying({ line, index })}
            />
          </Reveal>
        ))
      )}
      <SayItBetterSheet
        index={retrying ? retrying.index : null}
        said={retrying?.line.transcript ?? ''}
        sentence={
          retrying && correction
            ? practiceSentence(retrying.line.transcript, correction.original, correction.corrected)
            : ''
        }
        before={null}
        onClose={() => setRetrying(null)}
        onRight={() => undefined}
        check={(index, recording) =>
          api.retryChainLine(retrying?.line.id ?? '', index, {
            audio: recording.base64,
            format: recording.format,
            durationMs: recording.durationMs,
          })
        }
      />
    </StepLayout>
  );
}
