import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { Memory, MemoryChange } from '@konvami/api-client';
import { apiErrorCode, apiErrorKey } from '@/api/messages';
import { useSession } from '@/auth';
import { Button } from '@/components/button';
import { ConfirmSheet } from '@/components/confirm-sheet';
import { DateChoice } from '@/components/date-choice';
import { ListGroup, ListRow } from '@/components/list';
import { LoadState } from '@/components/load-state';
import { Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { Text } from '@/components/text';
import { TextField } from '@/components/text-field';
import { calendarDateOf, fromIsoDate } from '@/lib/dates';
import { commitFeedback } from '@/lib/haptics';
import { staggerDelay } from '@/lib/motion';
import { backOr } from '@/lib/navigation';
import { ROUTES } from '@/lib/routes';
import { usePracticeServices } from '@/practice/services';
import { useMemories, useProfileServices } from '@/profile/services';
import { ProfilePage } from '@/screens/profile/page';

// The longest note the server keeps (services/api: domain/memories.py, TEXT_MAX).
const TEXT_MAX = 200;
// How many lines the field shows before it scrolls: a note is a sentence or two.
const TEXT_LINES = 3;
// The day wheels offer this many years before and after this one: what is remembered is
// recent or coming up.
const YEARS_BACK = 1;
const YEARS_AHEAD = 2;

/** The message for a change the server refused, by its code. */
const PROBLEM = {
  duplicate: 'memory.edit.duplicate',
  invalid_value: 'memory.edit.invalid',
  invalid_request: 'memory.edit.invalid',
  not_found: 'memory.edit.gone',
} as const;

function problemKey(code: string) {
  return code in PROBLEM ? PROBLEM[code as keyof typeof PROBLEM] : apiErrorKey(code);
}

function MemoryForm({ memory, onForget }: { memory: Memory; onForget: () => Promise<void> }) {
  const { t } = useTranslation();
  const { memory: store } = useProfileServices();
  const { clock } = usePracticeServices();
  const [text, setText] = useState(memory.text);
  const [day, setDay] = useState(memory.day);
  const [saving, setSaving] = useState(false);
  const [asking, setAsking] = useState(false);
  const [forgetting, setForgetting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const words = text.trim();
  const change: MemoryChange = {
    ...(words !== memory.text ? { text: words } : {}),
    ...(day !== memory.day ? { day } : {}),
  };
  const changed = Object.keys(change).length > 0;
  const today = calendarDateOf(new Date(clock.now()));
  const shown = (day && fromIsoDate(day)) || today;

  async function save() {
    commitFeedback();
    setProblem(null);
    setSaving(true);
    try {
      await store.change(memory.id, change);
      backOr(ROUTES.accountMemory);
    } catch (error) {
      setProblem(t(problemKey(apiErrorCode(error))));
    } finally {
      setSaving(false);
    }
  }

  async function forget() {
    commitFeedback();
    setProblem(null);
    setForgetting(true);
    try {
      await onForget();
      backOr(ROUTES.accountMemory);
    } catch (error) {
      setAsking(false);
      setProblem(t(problemKey(apiErrorCode(error))));
    } finally {
      setForgetting(false);
    }
  }

  return (
    <ProfilePage
      title={t('memory.edit.title')}
      body={t('memory.edit.body')}
      backTo={ROUTES.accountMemory}
      actions={
        <Button
          label={t('memory.edit.save')}
          disabled={!changed || !words}
          loading={saving}
          onPress={() => void save()}
        />
      }
    >
      <Reveal delay={staggerDelay(1)}>
        <View className="gap-3">
          <TextField
            label={t('memory.edit.field')}
            value={text}
            onChangeText={(next) => {
              setText(next);
              setProblem(null);
            }}
            maxLength={TEXT_MAX}
            multiline
            numberOfLines={TEXT_LINES}
            textAlignVertical="top"
            autoCapitalize="sentences"
            editable={!saving}
          />
          {memory.partnerId ? (
            <Text variant="small" tone="subtle">
              {memory.partnerName
                ? t('memory.edit.partnerOnly', { name: memory.partnerName })
                : t('memory.edit.formerPartnerOnly')}
            </Text>
          ) : null}
          {memory.kind === 'event' ? (
            <DateChoice
              value={day}
              onChange={(next) => {
                setDay(next);
                setProblem(null);
              }}
              opensOn={today}
              years={{
                from: Math.min(today.year - YEARS_BACK, shown.year),
                to: Math.max(today.year + YEARS_AHEAD, shown.year),
              }}
              labels={{
                add: t('memory.edit.setDay'),
                change: t('memory.edit.changeDay'),
                remove: t('memory.edit.removeDay'),
                title: t('memory.edit.dayTitle'),
                confirm: t('memory.edit.confirmDay'),
              }}
            />
          ) : null}
          {problem ? (
            <NoticeBox icon="alert" tone="danger">
              {problem}
            </NoticeBox>
          ) : null}
        </View>
      </Reveal>
      <Reveal delay={staggerDelay(2)}>
        <ListGroup>
          <ListRow
            icon="trash"
            tone="danger"
            title={t('memory.edit.forget')}
            detail={t('memory.edit.forgetHint')}
            disabled={saving}
            onPress={() => setAsking(true)}
          />
        </ListGroup>
      </Reveal>
      <ConfirmSheet
        visible={asking}
        title={t('memory.edit.forgetTitle')}
        body={t('memory.edit.forgetBody')}
        confirmLabel={t('memory.edit.forgetYes')}
        cancelLabel={t('memory.edit.forgetNo')}
        danger
        loading={forgetting}
        onConfirm={() => void forget()}
        onCancel={() => setAsking(false)}
      />
    </ProfilePage>
  );
}

/**
 * 6.11 One memory (spec §6.11: "view, edit or delete any memory"): the note as the partners
 * know it, to put in the learner's own words; the day of something that is on a day; and the
 * way to have it forgotten for good.
 */
export function MemoryEditScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { status } = useSession();
  const { memory: store } = useProfileServices();
  const state = useMemories();
  // The memory being forgotten: it stays on screen while the screen leaves, although the
  // list no longer holds it.
  const [leaving, setLeaving] = useState<Memory | null>(null);
  const signedIn = status === 'signedIn';

  useEffect(() => {
    if (signedIn) void store.load();
  }, [signedIn, store]);

  const found =
    state.phase === 'ready' ? state.data.memories.find((memory) => memory.id === id) : undefined;
  const memory = found ?? leaving;
  if (memory) {
    return (
      <MemoryForm
        // A memory opened after another one starts from its own words.
        key={memory.id}
        memory={memory}
        onForget={async () => {
          setLeaving(memory);
          try {
            await store.remove(memory.id);
          } catch (error) {
            setLeaving(null);
            throw error;
          }
        }}
      />
    );
  }
  if (state.phase !== 'ready') {
    return (
      <ProfilePage title={t('memory.edit.title')} backTo={ROUTES.accountMemory}>
        <LoadState
          failed={state.phase === 'failed'}
          loadingLabel={t('memory.loading')}
          slowLabel={t('common.wakingUp')}
          failedLabel={t(state.error === 'network' ? 'errors.network' : 'memory.loadFailed')}
          retryLabel={t('common.retry')}
          onRetry={() => void store.reload()}
        />
      </ProfilePage>
    );
  }
  return (
    <ProfilePage
      title={t('memory.edit.title')}
      backTo={ROUTES.accountMemory}
      actions={
        <Button
          variant="secondary"
          label={t('memory.edit.backToList')}
          onPress={() => backOr(ROUTES.accountMemory)}
        />
      }
    >
      <NoticeBox icon="info">{t('memory.edit.gone')}</NoticeBox>
    </ProfilePage>
  );
}
