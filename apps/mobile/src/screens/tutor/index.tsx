import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { TutorQuestion } from '@konvami/api-client';
import { apiErrorCode } from '@/api/messages';
import { useSession } from '@/auth';
import { Badge } from '@/components/badge';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ChatBubble } from '@/components/chat';
import { LoadState } from '@/components/load-state';
import { Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { HeaderButton } from '@/components/step-header';
import { StepLayout } from '@/components/step-layout';
import { Text } from '@/components/text';
import { TextField } from '@/components/text-field';
import { commitFeedback } from '@/lib/haptics';
import { staggerDelay } from '@/lib/motion';
import { backOr } from '@/lib/navigation';
import { ROUTES } from '@/lib/routes';
import { usePracticeServices, useTutor } from '@/practice/services';

// The longest question the server takes (characters).
const QUESTION_MAX = 500;
// Lines the question field shows where it cannot grow by itself (the web).
const QUESTION_LINES = 3;

/** The message for a question the Tutor did not answer. */
function failureKey(code: string) {
  switch (code) {
    case 'tutor_limit':
      return 'tutor.limit';
    case 'consent_required':
      return 'tutor.consent';
    case 'not_found':
      return 'tutor.notFound';
    case 'network':
      return 'errors.network';
    default:
      return 'tutor.failed';
  }
}

/** One question as the learner asked it, and the Tutor's answer under it. */
function Asked({ asked }: { asked: TutorQuestion }) {
  const { t } = useTranslation();
  const { answer } = asked;
  return (
    <View className="gap-2.5">
      <ChatBubble from="learner" accessibilityLabel={t('tutor.you', { question: asked.question })}>
        {asked.question}
      </ChatBubble>
      <Card className="gap-3 p-4">
        {answer.topic || answer.unsure ? (
          <View className="flex-row flex-wrap items-center justify-between gap-2">
            <Text variant="caption" tone="subtle" className="shrink">
              {answer.topic
                ? t(`report.category.${answer.topic}` as 'report.category.other', {
                    defaultValue: t('report.category.other'),
                  })
                : ''}
            </Text>
            {answer.unsure ? <Badge label={t('tutor.unsure')} tone="surface" /> : null}
          </View>
        ) : null}
        <Text>{answer.explanation}</Text>
        {answer.examples.map((example, i) => (
          <View key={i} className="gap-0.5 border-l-2 border-primary pl-3">
            <Text variant="labelMedium">{example.text}</Text>
            <Text variant="small" tone="muted">
              {example.translation}
            </Text>
          </View>
        ))}
        {answer.unsure ? (
          <Text variant="small" tone="subtle">
            {t('tutor.unsureNote')}
          </Text>
        ) : null}
      </Card>
    </View>
  );
}

/**
 * 5.12 Ask the tutor (spec §6.8): a question about the language learned, typed, answered with
 * examples and the topic the answer rests on; the questions asked before, newest first. Opened
 * from a report's correction, it asks about that correction at once.
 */
export function TutorScreen() {
  const { t } = useTranslation();
  const { status } = useSession();
  const { tutor: store, askTutor } = usePracticeServices();
  const state = useTutor();
  const { conversation, correction } = useLocalSearchParams<{
    conversation?: string;
    correction?: string;
  }>();
  const [draft, setDraft] = useState('');
  // What is on its way to the Tutor, shown until the answer is there.
  const [asking, setAsking] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  // A correction to explain, from a report: asked once, as soon as the questions are there.
  const index = correction === undefined ? NaN : Number(correction);
  const fromReport = Boolean(conversation) && Number.isInteger(index) && index >= 0;
  const explained = useRef(false);
  const [explainDone, setExplainDone] = useState(false);
  const signedIn = status === 'signedIn';
  const ready = state.phase === 'ready';
  const explaining = fromReport && !explainDone;

  useEffect(() => {
    if (signedIn) void store.load();
  }, [signedIn, store]);

  async function send(asked: Parameters<typeof askTutor>[0], shown: string) {
    setAsking(shown);
    setFailure(null);
    try {
      await askTutor(asked);
      if ('question' in asked) setDraft('');
    } catch (error) {
      setFailure(t(failureKey(apiErrorCode(error))));
    } finally {
      setAsking(null);
    }
  }

  useEffect(() => {
    if (!ready || !fromReport || explained.current || !conversation) return;
    explained.current = true;
    askTutor({ conversationId: conversation, index })
      .catch((error: unknown) => setFailure(t(failureKey(apiErrorCode(error)))))
      .finally(() => setExplainDone(true));
  }, [ready, fromReport, conversation, index, askTutor, t]);

  if (!signedIn) return <Redirect href={ROUTES.welcome} />;
  const question = draft.trim();
  const busy = asking !== null || explaining;
  return (
    <StepLayout
      header={
        <View className="min-h-tap flex-row items-center">
          <HeaderButton
            icon="chevronLeft"
            label={t('common.back')}
            onPress={() => backOr(ROUTES.learn)}
          />
        </View>
      }
      actions={
        ready ? (
          <View className="gap-2.5">
            <TextField
              label={t('tutor.field')}
              placeholder={t('tutor.placeholder')}
              value={draft}
              onChangeText={setDraft}
              maxLength={QUESTION_MAX}
              // A question can be long: the field grows instead of hiding its start.
              multiline
              numberOfLines={QUESTION_LINES}
              submitBehavior="submit"
              returnKeyType="send"
              onSubmitEditing={() => {
                if (question && !busy) void send({ question }, question);
              }}
            />
            <Button
              label={t('tutor.ask')}
              disabled={!question || busy}
              loading={busy}
              onPress={() => {
                commitFeedback();
                void send({ question }, question);
              }}
            />
          </View>
        ) : undefined
      }
    >
      <Reveal>
        <View className="gap-1.5">
          <Text variant="title" accessibilityRole="header">
            {t('tutor.title')}
          </Text>
          <Text tone="muted">{t('tutor.body')}</Text>
        </View>
      </Reveal>
      {!ready ? (
        <LoadState
          failed={state.phase === 'failed'}
          loadingLabel={t('tutor.loading')}
          slowLabel={t('common.wakingUp')}
          failedLabel={t(state.error === 'network' ? 'errors.network' : 'tutor.loadFailed')}
          retryLabel={t('common.retry')}
          onRetry={() => void store.reload()}
        />
      ) : (
        <View className="gap-6">
          {failure ? (
            <View accessibilityLiveRegion="polite">
              <NoticeBox icon="alert" tone="danger">
                {failure}
              </NoticeBox>
            </View>
          ) : null}
          {busy ? (
            <View className="gap-2.5" accessibilityLiveRegion="polite">
              {asking ? <ChatBubble from="learner">{asking}</ChatBubble> : null}
              <Text tone="muted">{t('tutor.thinking')}</Text>
            </View>
          ) : null}
          {state.data.questions.map((asked, i) => (
            <Reveal key={asked.id} delay={staggerDelay(Math.min(i, 3) + 1)}>
              <Asked asked={asked} />
            </Reveal>
          ))}
        </View>
      )}
    </StepLayout>
  );
}
