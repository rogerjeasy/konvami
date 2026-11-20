import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { ExamPhrase, ExamPhraseBank, Phrase } from '@konvami/api-client';
import { apiErrorCode } from '@/api/messages';
import { useSession } from '@/auth';
import { ExamNotice } from '@/components/exam-notice';
import { Badge } from '@/components/badge';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { LoadState } from '@/components/load-state';
import { Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { PageHero } from '@/components/page-hero';
import { PlayButton } from '@/components/play-button';
import { Section } from '@/components/section';
import { HeaderButton } from '@/components/step-header';
import { StepLayout } from '@/components/step-layout';
import { Text } from '@/components/text';
import { useSound } from '@/hooks/use-sound';
import { commitFeedback } from '@/lib/haptics';
import { staggerDelay } from '@/lib/motion';
import { backOr } from '@/lib/navigation';
import { examPrepRoute, ROUTES } from '@/lib/routes';
import { usePhrasebook, usePracticeServices } from '@/practice/services';

type BankState =
  | { phase: 'loading' }
  | { phase: 'ready'; bank: ExamPhraseBank }
  | { phase: 'failed'; code: string };

/** The same phrase whatever its spacing or capitals, as the phrasebook keeps it once. */
const sameText = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** What a kept phrase offers: hearing it, and making it a card once. */
function KeptActions({ kept, onFailed }: { kept: Phrase; onFailed: (code: string) => void }) {
  const { t } = useTranslation();
  const { makePhraseCard, phraseSound } = usePracticeServices();
  const sound = useSound(kept.id, phraseSound);
  const [busy, setBusy] = useState(false);
  return (
    <View className="gap-2">
      <View className="flex-row flex-wrap items-center gap-2">
        <Badge label={t('examPhrases.kept')} tone="surface" />
        {kept.inDeck ? <Badge label={t('phrasebook.inCards')} tone="surface" /> : null}
      </View>
      <PlayButton
        label={t(sound.state === 'playing' ? 'learn.card.stopListening' : 'learn.card.listen')}
        state={sound.state}
        onPress={sound.toggle}
      />
      {kept.inDeck ? null : (
        <Button
          variant="secondary"
          label={t('phrasebook.makeCard')}
          accessibilityLabel={t('phrasebook.makeCardLabel', { phrase: kept.phrase })}
          loading={busy}
          onPress={() => {
            commitFeedback();
            setBusy(true);
            makePhraseCard(kept.id)
              .catch((error: unknown) => onFailed(apiErrorCode(error)))
              .finally(() => setBusy(false));
          }}
        />
      )}
    </View>
  );
}

/** One phrase of the bank, its meaning, the level it suits, and keeping it. */
function BankPhrase({
  phrase,
  situation,
  kept,
  onFailed,
}: {
  phrase: ExamPhrase;
  /** What the phrasebook files it under: the exam's name. */
  situation: string;
  kept: Phrase | undefined;
  onFailed: (code: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const { keepPhrase } = usePracticeServices();
  const [busy, setBusy] = useState(false);
  const meaning = phrase.meanings[i18n.language] ?? phrase.meanings.en ?? '';
  return (
    <Card className="gap-3 p-4">
      <View className="gap-1">
        <Text variant="langBody">{phrase.text}</Text>
        {/* A German explanation would only repeat the phrase. */}
        {meaning && !sameText(meaning, phrase.text) ? (
          <Text variant="small" tone="muted">
            {meaning}
          </Text>
        ) : null}
        <Text variant="caption" tone="subtle">
          {t('examPhrases.level', { level: phrase.level })}
        </Text>
      </View>
      {kept ? (
        <KeptActions kept={kept} onFailed={onFailed} />
      ) : (
        <Button
          variant="secondary"
          label={t('examPhrases.keep')}
          accessibilityLabel={t('examPhrases.keepLabel', { phrase: phrase.text })}
          loading={busy}
          onPress={() => {
            commitFeedback();
            setBusy(true);
            keepPhrase({ phrase: phrase.text, meaning: meaning || phrase.text, situation })
              .catch((error: unknown) => onFailed(apiErrorCode(error)))
              .finally(() => setBusy(false));
          }}
        />
      )}
    </Card>
  );
}

function Bank({ bank }: { bank: ExamPhraseBank }) {
  const { t } = useTranslation();
  const { phrasebook } = usePracticeServices();
  const kept = usePhrasebook();
  const [failure, setFailure] = useState<string | null>(null);
  useEffect(() => {
    void phrasebook.load();
  }, [phrasebook]);
  const phrases = kept.phase === 'ready' ? kept.data.phrases : [];
  const failed = (code: string) =>
    setFailure(t(code === 'network' ? 'errors.network' : 'examPhrases.failed'));
  return (
    <>
      {failure ? (
        <NoticeBox icon="info" tone="warn">
          {failure}
        </NoticeBox>
      ) : null}
      {bank.groups.map((group, index) => (
        <Reveal key={group.function} delay={staggerDelay(Math.min(index, 3) + 1)}>
          <Section
            title={t(`examPhrases.functions.${group.function}`)}
            count={group.phrases.length}
          >
            <View className="gap-3">
              {group.phrases.map((phrase) => (
                <BankPhrase
                  key={phrase.text}
                  phrase={phrase}
                  situation={bank.name}
                  kept={phrases.find((found) => sameText(found.phrase, phrase.text))}
                  onFailed={failed}
                />
              ))}
            </View>
          </Section>
        </Reveal>
      ))}
    </>
  );
}

/**
 * 5.25 Phrase bank (spec §6.13): the phrases that help in a speaking test, grouped by what they
 * do (making suggestions, disagreeing politely, structuring a talk…), at the exam's level, with
 * their meaning in the learner's language. A phrase the learner keeps goes to the phrasebook
 * (5.19), where it can be heard and made a card; here it can be too. Reached from the exam
 * centre and the preparation of a simulation.
 */
export function ExamPhrasesScreen() {
  const { t } = useTranslation();
  const { status } = useSession();
  const { exam } = useLocalSearchParams<{ exam: string }>();
  const { readExamPhraseBank } = usePracticeServices();
  const [attempt, setAttempt] = useState(0);
  const [found, setFound] = useState<{ key: string; state: BankState } | null>(null);
  const key = `${exam ?? ''}:${attempt}`;
  const signedIn = status === 'signedIn';

  useEffect(() => {
    if (!signedIn || !exam) return;
    let current = true;
    readExamPhraseBank(exam).then(
      (bank) => current && setFound({ key, state: { phase: 'ready', bank } }),
      (error: unknown) =>
        current && setFound({ key, state: { phase: 'failed', code: apiErrorCode(error) } }),
    );
    return () => {
      current = false;
    };
  }, [exam, key, readExamPhraseBank, signedIn]);

  if (!signedIn) return <Redirect href={ROUTES.welcome} />;
  const state: BankState = found?.key === key ? found.state : { phase: 'loading' };
  return (
    <StepLayout
      header={
        <View className="min-h-tap flex-row items-center">
          <HeaderButton
            icon="chevronLeft"
            label={t('common.back')}
            onPress={() => backOr(exam ? examPrepRoute(exam) : ROUTES.exams)}
          />
        </View>
      }
    >
      {state.phase === 'ready' ? (
        <>
          <Reveal>
            <PageHero
              color="forest"
              icon="book"
              title={t('examPhrases.title')}
              body={t('examPhrases.body', { name: state.bank.name })}
            />
          </Reveal>
          <Bank bank={state.bank} />
        </>
      ) : (
        <LoadState
          failed={state.phase === 'failed'}
          loadingLabel={t('examPhrases.loading')}
          slowLabel={t('common.wakingUp')}
          failedLabel={t(
            state.phase === 'failed' && state.code === 'network'
              ? 'errors.network'
              : 'examPhrases.loadFailed',
          )}
          retryLabel={t('common.retry')}
          onRetry={() => setAttempt((count) => count + 1)}
        />
      )}
      <ExamNotice />
    </StepLayout>
  );
}
