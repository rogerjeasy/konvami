import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { CourseImport } from '@konvami/api-client';
import { apiErrorCode } from '@/api/messages';
import { useSession } from '@/auth';
import { Badge } from '@/components/badge';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { LoadState } from '@/components/load-state';
import { Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { Section } from '@/components/section';
import { HeaderButton } from '@/components/step-header';
import { StepLayout } from '@/components/step-layout';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { commitFeedback } from '@/lib/haptics';
import { staggerDelay } from '@/lib/motion';
import { backOr } from '@/lib/navigation';
import { importCallRoute, letterCallRoute, ROUTES } from '@/lib/routes';
import { usePracticeServices, useSuggestedPartner } from '@/practice/services';
import { importFailureKey } from './failure';
import { ImportWordCard } from './word-card';

type Reading =
  { phase: 'loading' } | { phase: 'failed'; code: string } | { phase: 'ready'; item: CourseImport };

/** One import, read from the server, and a way to read it again after a card was saved. */
function useImport(id: string) {
  const { readImport } = usePracticeServices();
  const [reading, setReading] = useState<Reading>({ phase: 'loading' });
  const read = useCallback(
    async (quiet: boolean) => {
      if (!quiet) setReading({ phase: 'loading' });
      try {
        setReading({ phase: 'ready', item: await readImport(id) });
      } catch (error) {
        setReading((shown) =>
          quiet && shown.phase === 'ready' ? shown : { phase: 'failed', code: apiErrorCode(error) },
        );
      }
    },
    [id, readImport],
  );
  useEffect(() => {
    void read(false);
  }, [read]);
  return { reading, reload: () => read(false), refresh: () => read(true) };
}

/**
 * 5.23 One import worked out (spec §6.17): what it is and says in short, for a letter what it
 * asks and what to do, the words to save as cards, the grammar, the hard sentences and the text
 * that was read. From here the learner talks it over with their partner, or, for a letter,
 * rehearses the reply or the phone call.
 */
export function ImportResultScreen() {
  const { t } = useTranslation();
  const { status } = useSession();
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const { removeImport } = usePracticeServices();
  const { reading, reload, refresh } = useImport(id);
  const partner = useSuggestedPartner();
  const [failure, setFailure] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const signedIn = status === 'signedIn';

  async function remove() {
    commitFeedback();
    setRemoving(true);
    try {
      await removeImport(id);
      backOr(ROUTES.import);
    } catch (error) {
      setFailure(t(importFailureKey(apiErrorCode(error))));
      setRemoving(false);
    }
  }

  if (!signedIn) return <Redirect href={ROUTES.welcome} />;
  const item = reading.phase === 'ready' ? reading.item : null;
  const book = item?.textbook ? [item.textbook, item.chapter].filter(Boolean).join(', ') : null;
  return (
    <StepLayout
      header={
        <View className="min-h-tap flex-row items-center">
          <HeaderButton
            icon="chevronLeft"
            label={t('common.back')}
            onPress={() => backOr(ROUTES.import)}
          />
        </View>
      }
      actions={
        item ? (
          <>
            <Button
              label={t('import.result.talk')}
              disabled={!partner}
              onPress={() => {
                if (!partner) return;
                commitFeedback();
                router.push(importCallRoute(partner, item.id));
              }}
            />
            {item.letter ? (
              <Button
                variant="secondary"
                label={t('import.result.rehearse')}
                disabled={!partner}
                onPress={() => {
                  if (!partner) return;
                  commitFeedback();
                  router.push(letterCallRoute(partner, item.id));
                }}
              />
            ) : null}
          </>
        ) : undefined
      }
    >
      {reading.phase === 'failed' && reading.code === 'not_found' ? (
        <NoticeBox icon="info">{t('import.result.notFound')}</NoticeBox>
      ) : !item ? (
        <LoadState
          failed={reading.phase === 'failed'}
          loadingLabel={t('import.result.loading')}
          slowLabel={t('common.wakingUp')}
          failedLabel={t(
            reading.phase === 'failed' && reading.code === 'network'
              ? 'errors.network'
              : 'import.result.loadFailed',
          )}
          retryLabel={t('common.retry')}
          onRetry={() => void reload()}
        />
      ) : (
        <View className="gap-6">
          <Reveal>
            <View className="gap-2">
              <Text variant="title" accessibilityRole="header">
                {item.title}
              </Text>
              <View className="flex-row flex-wrap items-center gap-2">
                <Badge label={t(`import.${item.genre}`)} />
                <Badge label={t('import.result.level', { level: item.level })} tone="surface" />
                {book ? <Badge label={t('import.result.from', { book })} tone="surface" /> : null}
              </View>
            </View>
          </Reveal>
          {failure ? (
            <View accessibilityLiveRegion="polite">
              <NoticeBox icon="alert" tone="danger">
                {failure}
              </NoticeBox>
            </View>
          ) : null}
          <Reveal delay={staggerDelay(1)}>
            <Section title={t('import.result.summary')}>
              <View className="gap-2">
                <Text>{item.summary}</Text>
                <Text variant="small" tone="subtle">
                  {t('import.result.aiNote')}
                </Text>
              </View>
            </Section>
          </Reveal>
          {item.letter ? (
            <Reveal delay={staggerDelay(2)}>
              <Section title={t('import.result.letter')}>
                <Card className="gap-3 p-4">
                  <Text variant="labelMedium">
                    {t('import.result.letterFrom', { sender: item.letter.sender })}
                  </Text>
                  <Text>{item.letter.says}</Text>
                  {item.letter.toDo.length > 0 ? (
                    <View className="gap-1">
                      <Text variant="fieldLabel">{t('import.result.letterToDo')}</Text>
                      {item.letter.toDo.map((step) => (
                        <Text key={step} variant="small" tone="muted">
                          {`• ${step}`}
                        </Text>
                      ))}
                    </View>
                  ) : null}
                  {item.letter.replyGoal ? (
                    <Text variant="small" tone="muted">
                      {t('import.result.letterGoal', { goal: item.letter.replyGoal })}
                    </Text>
                  ) : null}
                </Card>
              </Section>
            </Reveal>
          ) : null}
          {item.vocabulary.length > 0 ? (
            <Section title={t('import.result.words')} count={item.vocabulary.length}>
              <View className="gap-3">
                {item.vocabulary.map((word, index) => (
                  <ImportWordCard
                    key={word.word}
                    importId={item.id}
                    index={index}
                    word={word}
                    onSaved={() => void refresh()}
                    onFailed={(code) => setFailure(t(importFailureKey(code)))}
                  />
                ))}
              </View>
            </Section>
          ) : null}
          {item.grammar.length > 0 ? (
            <Section title={t('import.result.grammar')}>
              <View className="gap-3">
                {item.grammar.map((point) => (
                  <Card key={point.point} className="gap-1 p-4">
                    <Text variant="labelMedium">{point.point}</Text>
                    <Text variant="small" tone="muted">
                      {point.explanation}
                    </Text>
                  </Card>
                ))}
              </View>
            </Section>
          ) : null}
          {item.hardSentences.length > 0 ? (
            <Section title={t('import.result.hard')}>
              <View className="gap-3">
                {item.hardSentences.map((hard) => (
                  <Card key={hard.sentence} className="gap-1 p-4">
                    <Text variant="labelMedium">{hard.sentence}</Text>
                    <Text variant="small" tone="muted">
                      {hard.explanation}
                    </Text>
                  </Card>
                ))}
              </View>
            </Section>
          ) : null}
          <Section
            title={t(item.kind === 'photo' ? 'import.result.textPhoto' : 'import.result.text')}
          >
            <Card className="p-4">
              <Text variant="small" tone="muted" selectable>
                {item.text}
              </Text>
            </Card>
          </Section>
          <View className="items-center">
            <TextButton
              label={t('import.result.remove')}
              accessibilityLabel={t('import.result.removeLabel', { title: item.title })}
              disabled={removing}
              onPress={() => void remove()}
            />
          </View>
        </View>
      )}
    </StepLayout>
  );
}
