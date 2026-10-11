import { View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { Transcript } from '@konvami/api-client';
import { useSession } from '@/auth';
import { ChatBubble } from '@/components/chat';
import { ListGroup, ListRow } from '@/components/list';
import { LoadState } from '@/components/load-state';
import { Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { HeaderButton } from '@/components/step-header';
import { StepLayout } from '@/components/step-layout';
import { Text } from '@/components/text';
import { formatClock, wholeMinutes } from '@/lib/format';
import { staggerDelay } from '@/lib/motion';
import { backOr } from '@/lib/navigation';
import { relativeDayLabel } from '@/lib/relative-day';
import { reportRoute, ROUTES } from '@/lib/routes';
import { useConversation, usePracticeServices } from '@/practice/services';

// Stands between the parts of the line under the title ("Today · 14:05 · 8 min").
const SEPARATOR = ' · ';

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
      {/* A call counts as practice, and has a report, once the learner said something in it. */}
      {conversation.endedAt && conversation.learnerTurns > 0 ? (
        <Reveal delay={staggerDelay(1)}>
          <ListGroup>
            <ListRow
              icon="file"
              title={t('library.transcript.report')}
              detail={t('library.transcript.reportHint')}
              onPress={() => router.push(reportRoute(conversation.id))}
            />
          </ListGroup>
        </Reveal>
      ) : null}
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
 * learner on the right, with the way to its report. Text only: the recording arrives with the
 * audio library.
 */
export function TranscriptScreen() {
  const { t } = useTranslation();
  const { status } = useSession();
  const { clock } = usePracticeServices();
  const { id } = useLocalSearchParams<{ id: string }>();
  const reading = useConversation(id ?? '');

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
