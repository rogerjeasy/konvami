import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import { apiErrorCode } from '@/api/messages';
import { useSession } from '@/auth';
import { Button } from '@/components/button';
import { ChoiceChip } from '@/components/choice-chip';
import { ChoiceGroup } from '@/components/choice-group';
import { EmptyState } from '@/components/empty-state';
import { Icon } from '@/components/icon';
import { LoadState } from '@/components/load-state';
import { Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { RecordingNow } from '@/components/recording-now';
import { HeaderButton } from '@/components/step-header';
import { StepLayout } from '@/components/step-layout';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { commitFeedback } from '@/lib/haptics';
import { staggerDelay } from '@/lib/motion';
import { backOr } from '@/lib/navigation';
import { ROUTES } from '@/lib/routes';
import { usePenPalThread } from '@/pen-pal/use-thread';
import { useHome, usePenPal, usePracticeServices } from '@/practice/services';
import { useTheme } from '@/theme';
import { useSpokenAttempt } from '@/voice/use-spoken-attempt';
import { Corrections, NoteBubble, noteMilliseconds } from './note-bubble';
import { PenPalSettingsSheet } from './settings-sheet';

// A voice note to a pen-pal may run longer than a sentence said again (ms).
const MAX_NOTE_MS = 60_000;
// Notes shown with a stagger as the thread opens; the rest appear at once.
const STAGGERED_NOTES = 3;

/** The message for a request the thread did not complete. */
function failureKey(code: string) {
  switch (code) {
    case 'mic_denied':
      return 'conversation.problems.mic_denied';
    case 'network':
      return 'errors.network';
    case 'limit':
      return 'penPal.failed.limit';
    case 'too_short':
      return 'penPal.failed.too_short';
    case 'consent_required':
      return 'penPal.failed.consent_required';
    default:
      return 'penPal.failed.unavailable';
  }
}

/**
 * 5.21 Pen-pal (spec §6.16): a chat with one partner made of voice notes. The partner writes when
 * it suits the learner (their settings); the learner answers with a voice note, which is written
 * down word for word, and the partner answers that with a note of its own and, where there is
 * something worth saying, a small correction. A note is played from its bubble and its text
 * stays under it. Nothing is live: a note being recorded by the partner shows as such.
 */
export function PenPalScreen() {
  const { t } = useTranslation();
  const { color } = useTheme();
  const { status } = useSession();
  const { partner: requested } = useLocalSearchParams<{ partner?: string }>();
  const {
    home: homeStore,
    clips,
    clock,
    changePenPal,
    openPenPalThread,
    askForPenPalNote,
    sendPenPalReply,
    retryPenPalNote,
  } = usePracticeServices();
  const home = useHome();
  const overview = usePenPal();
  const signedIn = status === 'signedIn';
  const [chosen, setChosen] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  // The notes that could not be tried again (three attempts are all there are).
  const [exhausted, setExhausted] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    if (signedIn) void homeStore.load();
  }, [signedIn, homeStore]);

  const partners = home.phase === 'ready' ? home.data.partners : [];
  const unreadOf = (id: string) =>
    overview.phase === 'ready'
      ? (overview.data.threads.find((thread) => thread.personaId === id)?.unread ?? 0)
      : 0;
  // The partner asked for, else one with a note waiting, else the one Today suggests.
  const personaId =
    chosen ??
    partners.find(({ persona }) => persona.id === requested)?.persona.id ??
    partners.find(({ persona }) => unreadOf(persona.id) > 0)?.persona.id ??
    (home.phase === 'ready' ? home.data.suggestedPartnerId : null) ??
    partners[0]?.persona.id ??
    null;
  const partner = partners.find(({ persona }) => persona.id === personaId)?.persona;
  const name = partner?.name ?? '';

  const { state, refresh } = usePenPalThread(signedIn ? personaId : null);
  const unread = state.phase === 'ready' ? state.thread.unread : 0;

  // What the partner sent counts as read once the thread is open.
  useEffect(() => {
    if (personaId && unread > 0) openPenPalThread(personaId).catch(() => {});
  }, [personaId, unread, openPenPalThread]);

  // Leaving stops what is playing.
  useEffect(() => () => clips.stop(), [clips]);

  const { step, record, stop, reset } = useSpokenAttempt(
    (recording) => {
      if (!personaId) return Promise.reject(new Error('no partner'));
      return sendPenPalReply(personaId, recording);
    },
    undefined,
    MAX_NOTE_MS,
  );
  // The learner's note is in the thread and the answer is on its way: read it, and be ready for
  // another.
  const sent = step.kind === 'heard';
  useEffect(() => {
    if (!sent) return;
    refresh();
    reset();
    // `reset` and `refresh` are stable enough: this runs once for each note sent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sent]);

  function play(id: string, url: string, text: string) {
    commitFeedback();
    if (playing === id) {
      clips.stop();
      return;
    }
    setPlaying(id);
    clips.play(
      url,
      () => setPlaying((current) => (current === id ? null : current)),
      noteMilliseconds(text),
    );
  }

  async function ask() {
    if (!personaId) return;
    commitFeedback();
    setAsking(true);
    setFailure(null);
    try {
      await askForPenPalNote(personaId);
      refresh();
    } catch (error) {
      setFailure(t(failureKey(apiErrorCode(error))));
    } finally {
      setAsking(false);
    }
  }

  async function retry(noteId: string) {
    commitFeedback();
    setFailure(null);
    try {
      await retryPenPalNote(noteId);
      refresh();
    } catch (error) {
      if (apiErrorCode(error) === 'retry_limit')
        setExhausted((shown) => new Set(shown).add(noteId));
      else setFailure(t(failureKey(apiErrorCode(error))));
    }
  }

  if (!signedIn) return <Redirect href={ROUTES.welcome} />;
  const settings = overview.phase === 'ready' ? overview.data.settings : null;
  const notes = state.phase === 'ready' ? state.thread.notes : [];
  const idle = step.kind === 'ready';
  const listening = state.phase === 'ready' && partner !== undefined;
  const problem = failure ?? (step.kind === 'failed' ? t(failureKey(step.code)) : null);
  return (
    <StepLayout
      header={
        <View className="min-h-tap flex-row items-center justify-between">
          <HeaderButton
            icon="chevronLeft"
            label={t('common.back')}
            onPress={() => backOr(ROUTES.talk)}
          />
          {settings ? (
            <TextButton
              tone="primary"
              label={t('penPal.settings')}
              onPress={() => setSettingsOpen(true)}
            />
          ) : null}
        </View>
      }
      actions={
        listening ? (
          <View className="gap-2.5">
            {step.kind === 'recording' ? (
              <RecordingNow
                label={t('penPal.recording')}
                hint={t('penPal.recordingHint')}
                stopLabel={t('penPal.stop')}
                onStop={() => void stop()}
              />
            ) : step.kind === 'checking' ? (
              <Text tone="muted" accessibilityLiveRegion="polite" className="text-center">
                {t('penPal.checking')}
              </Text>
            ) : (
              <>
                <Button
                  label={t('penPal.record')}
                  leading={<Icon name="mic" color={color.onPrimary} size={size.iconMd} />}
                  onPress={() => {
                    setFailure(null);
                    clips.stop();
                    void record();
                  }}
                />
              </>
            )}
          </View>
        ) : undefined
      }
    >
      <Reveal>
        <View className="gap-1.5">
          <Text variant="title" accessibilityRole="header">
            {t('penPal.title')}
          </Text>
          <Text tone="muted">{t('penPal.body')}</Text>
        </View>
      </Reveal>
      {partners.length > 1 ? (
        <ChoiceGroup label={t('penPal.partner')} chips>
          {partners.map(({ persona }) => (
            <ChoiceChip
              key={persona.id}
              label={
                unreadOf(persona.id) > 0 ? `${persona.name} · ${t('penPal.new')}` : persona.name
              }
              selected={persona.id === personaId}
              onPress={() => {
                clips.stop();
                setChosen(persona.id);
              }}
            />
          ))}
        </ChoiceGroup>
      ) : null}
      {home.phase !== 'ready' || state.phase !== 'ready' ? (
        <LoadState
          failed={home.phase === 'failed' || state.phase === 'failed'}
          loadingLabel={t('penPal.loading')}
          slowLabel={t('common.wakingUp')}
          failedLabel={t(
            (state.phase === 'failed' && state.code === 'network') || home.error === 'network'
              ? 'errors.network'
              : 'penPal.loadFailed',
          )}
          retryLabel={t('common.retry')}
          onRetry={() => {
            void homeStore.reload();
            refresh();
          }}
        />
      ) : (
        <View className="gap-4">
          {problem ? (
            <View accessibilityLiveRegion="polite">
              <NoticeBox icon="alert" tone="danger">
                {problem}
              </NoticeBox>
            </View>
          ) : null}
          {notes.length === 0 ? (
            <EmptyState
              icon="mic"
              title={t('penPal.emptyTitle')}
              body={t(settings?.enabled ? 'penPal.emptyOn' : 'penPal.emptyOff', { name })}
            />
          ) : (
            notes.map((note, i) => (
              <Reveal key={note.id} delay={staggerDelay(Math.min(i, STAGGERED_NOTES))}>
                <View className="gap-2.5">
                  <NoteBubble
                    note={note}
                    name={name}
                    playing={playing === note.id ? 'playing' : 'idle'}
                    onPlay={() => note.audioUrl && play(note.id, note.audioUrl, note.text)}
                    onRetry={() => void retry(note.id)}
                    retryLimit={exhausted.has(note.id)}
                  />
                  <Corrections corrections={note.corrections} />
                </View>
              </Reveal>
            ))
          )}
          {/* Under the notes, not pinned: two pinned buttons left a 320 x 568 phone a sliver of thread. */}
          {idle ? (
            <TextButton
              tone="primary"
              label={t('penPal.ask', { name })}
              disabled={asking}
              onPress={() => void ask()}
            />
          ) : null}
        </View>
      )}
      {settings ? (
        <PenPalSettingsSheet
          visible={settingsOpen}
          settings={settings}
          timeZone={clock.timeZone()}
          onChange={changePenPal}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}
    </StepLayout>
  );
}
