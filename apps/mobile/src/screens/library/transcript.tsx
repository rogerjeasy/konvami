import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { Transcript } from '@konvami/api-client';
import { apiErrorCode } from '@/api/messages';
import { useSession } from '@/auth';
import { ChatBubble } from '@/components/chat';
import { LoadState } from '@/components/load-state';
import { Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { HeaderButton } from '@/components/step-header';
import { StepLayout } from '@/components/step-layout';
import { Text } from '@/components/text';
import { formatClock, wholeMinutes } from '@/lib/format';
import { backOr } from '@/lib/navigation';
import { relativeDayLabel } from '@/lib/relative-day';
import { ROUTES } from '@/lib/routes';
import { usePracticeServices } from '@/practice/services';

// Stands between the parts of the line under the title ("Today · 14:05 · 8 min").
const SEPARATOR = ' · ';

type Reading =
  | { phase: 'loading' }
  | { phase: 'failed'; code: string }
  | { phase: 'ready'; transcript: Transcript };

/** Reads one conversation; `retry` reads it again after a failure. */
function useTranscript(id: string): Reading & { retry: () => void } {
  const { readConversation } = usePracticeServices();
  const [reading, setReading] = useState<Reading>({ phase: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    readConversation(id).then(
      (transcript) => current && setReading({ phase: 'ready', transcript }),
      (error: unknown) => current && setReading({ phase: 'failed', code: apiErrorCode(error) }),
    );
    return () => {
      current = false;
    };
  }, [readConversation, id, attempt]);

  return {
    ...reading,
    retry: () => {
      setReading({ phase: 'loading' });
      setAttempt((count) => count + 1);
    },
  };
}

function Lines({ transcript, now }: { transcript: Transcript; now: Date }) {
  const { t, i18n } = useTranslation();
  const { conversation, turns } = transcript;
  const partner = conversation.partner?.name ?? t('conversations.formerPartner');
  const meta = [
    relativeDayLabel(t, i18n.language, conversation.startedAt, now),
    formatClock(i18n.language, conversation.startedAt),
    conversation.endedAt ? t('time.minutes', { count: wholeMinutes(conversation.seconds) }) : null,
  ].filter((part) => part !== null);
  return (
    <>
      <Reveal>
        <View className="gap-1.5">
          <Text variant="title" accessibilityRole="header">
            {conversation.partner
              ? t('library.transcript.title', { name: partner })
              : t('library.transcript.titleNoPartner')}
          </Text>
          <Text variant="small" tone="subtle">
            {meta.join(SEPARATOR)}
          </Text>
        </View>
      </Reveal>
      {turns.length === 0 ? (
        <Text tone="muted">{t('library.transcript.empty')}</Text>
      ) : (
        <View className="gap-2.5">
          {turns.map((turn, i) => (
            // A screen reader hears who said each line; sighted readers see it by the side.
            <View
              key={i}
              accessible
              accessibilityLabel={t('library.transcript.line', {
                speaker: turn.speaker === 'persona' ? partner : t('library.transcript.you'),
                text: turn.text,
              })}
              className="w-full"
            >
              <ChatBubble from={turn.speaker}>{turn.text}</ChatBubble>
            </View>
          ))}
        </View>
      )}
    </>
  );
}

/**
 * 5.6 Transcript: one past conversation as it was said, the partner on the left and the
 * learner on the right. Text only; the recording and the corrections arrive with the session
 * report.
 */
export function TranscriptScreen() {
  const { t } = useTranslation();
  const { status } = useSession();
  const { clock } = usePracticeServices();
  const { id } = useLocalSearchParams<{ id: string }>();
  const reading = useTranscript(id ?? '');

  if (status !== 'signedIn') return <Redirect href={ROUTES.welcome} />;
  return (
    <StepLayout
      header={
        <View className="min-h-tap flex-row items-center">
          <HeaderButton
            icon="chevronLeft"
            label={t('common.back')}
            onPress={() => backOr(ROUTES.library)}
          />
        </View>
      }
    >
      {reading.phase === 'ready' ? (
        <Lines transcript={reading.transcript} now={new Date(clock.now())} />
      ) : reading.phase === 'failed' && reading.code === 'not_found' ? (
        <NoticeBox icon="info">{t('library.transcript.notFound')}</NoticeBox>
      ) : (
        <LoadState
          failed={reading.phase === 'failed'}
          loadingLabel={t('library.transcript.loading')}
          slowLabel={t('common.wakingUp')}
          failedLabel={t(
            reading.phase === 'failed' && reading.code === 'network'
              ? 'errors.network'
              : 'library.transcript.loadFailed',
          )}
          retryLabel={t('common.retry')}
          onRetry={reading.retry}
        />
      )}
    </StepLayout>
  );
}
