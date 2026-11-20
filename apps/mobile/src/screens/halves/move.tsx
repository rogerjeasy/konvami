import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { HalvesReaction, HalvesReportReason } from '@konvami/api-client';
import { useSession } from '@/auth';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ChoiceChip } from '@/components/choice-chip';
import { ChoiceGroup } from '@/components/choice-group';
import { LoadState } from '@/components/load-state';
import { Pop, Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { OptionCard } from '@/components/option-card';
import { PageHero } from '@/components/page-hero';
import { PlayButton } from '@/components/play-button';
import { ChoiceRow, Sheet } from '@/components/sheet';
import { HeaderButton } from '@/components/step-header';
import { StepLayout } from '@/components/step-layout';
import { Switch } from '@/components/switch';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { TextField } from '@/components/text-field';
import { useHalvesApi, useHalvesCase } from '@/halves/services';
import { commitFeedback, successFeedback } from '@/lib/haptics';
import { staggerDelay } from '@/lib/motion';
import { backOr } from '@/lib/navigation';
import { halvesCaseRoute, ROUTES } from '@/lib/routes';
import { usePracticeServices } from '@/practice/services';
import { PartnerLine } from './parts';

const REACTIONS: HalvesReaction[] = ['got_it', 'again_slower', 'helped', 'bravo'];
const REASONS: HalvesReportReason[] = [
  'harassment',
  'sexual',
  'personal',
  'hate',
  'off_topic',
  'other',
];
// A report's note is a sentence or two (the server takes 300 characters).
const NOTE_MAX = 300;

/** 7.10 Report a move: a reason, an optional note for the owner, and blocking at once. */
function ReportSheet({
  visible,
  onSend,
  onClose,
}: {
  visible: boolean;
  onSend: (reason: HalvesReportReason, note: string, block: boolean) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState<HalvesReportReason | null>(null);
  const [note, setNote] = useState('');
  const [block, setBlock] = useState(false);
  const [sending, setSending] = useState(false);
  return (
    <Sheet visible={visible} title={t('halves.report.title')} icon="flag" onClose={onClose}>
      <View className="gap-3 pt-1">
        <Text tone="muted">{t('halves.report.body')}</Text>
        {REASONS.map((one) => (
          <ChoiceRow
            key={one}
            label={t(`halves.report.reason.${one}`)}
            selected={reason === one}
            onPress={() => setReason(one)}
          />
        ))}
        <TextField
          label={t('halves.report.note')}
          value={note}
          onChangeText={setNote}
          maxLength={NOTE_MAX}
          multiline
        />
        <Switch label={t('halves.report.block')} value={block} onValueChange={setBlock} />
        <Button
          label={t('halves.report.send')}
          disabled={reason === null}
          loading={sending}
          onPress={() => {
            if (!reason) return;
            setSending(true);
            void onSend(reason, note.trim(), block).finally(() => setSending(false));
          }}
        />
      </View>
    </Sheet>
  );
}

/**
 * 7.7 A clue the other player sent: play it (the veiled voice when they chose it), react with a
 * template, answer the board's question with what was heard, and report it (7.10).
 */
export function HalvesMoveScreen() {
  const { t } = useTranslation();
  const { status } = useSession();
  const signedIn = status === 'signedIn';
  const { id, move } = useLocalSearchParams<{ id: string; move: string }>();
  const api = useHalvesApi();
  const { clips } = usePracticeServices();
  const { state, refresh, set } = useHalvesCase(signedIn ? (id ?? null) : null);
  const [playing, setPlaying] = useState<'idle' | 'loading' | 'playing'>('idle');
  const [reporting, setReporting] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => () => clips.stop(), [clips]);

  if (!signedIn) return <Redirect href={ROUTES.welcome} />;
  const found = state.phase === 'ready' ? state.data : null;
  const round = found?.rounds.find((r) => r.theirs?.id === move);
  const theirs = round?.theirs ?? null;

  async function play() {
    if (!move) return;
    commitFeedback();
    if (playing === 'playing') {
      clips.stop();
      setPlaying('idle');
      return;
    }
    setPlaying('loading');
    try {
      const { url } = await api.getHalvesMoveAudio(move);
      setPlaying('playing');
      clips.play(url, () => setPlaying('idle'));
    } catch {
      setPlaying('idle');
    }
  }

  async function react(reaction: HalvesReaction) {
    if (!move) return;
    commitFeedback();
    set(await api.reactToHalvesMove(move, reaction));
  }

  async function answer(option: number) {
    if (!move) return;
    setBusy(true);
    try {
      const changed = await api.answerHalvesMove(move, option);
      const after = changed.rounds.find((r) => r.theirs?.id === move)?.theirs;
      if (after?.solution === option) successFeedback();
      else commitFeedback();
      set(changed);
    } finally {
      setBusy(false);
    }
  }

  async function report(reason: HalvesReportReason, note: string, block: boolean) {
    if (!move || !id) return;
    let changed = await api.reportHalvesMove(move, { reason, note: note || null });
    if (block) changed = await api.blockHalvesPartner(id);
    set(changed);
    setReporting(false);
    router.replace(halvesCaseRoute(id));
  }

  const settled = theirs ? theirs.solution !== null : false;
  const wrongOnce = theirs ? theirs.answers.length > 0 && !settled : false;
  return (
    <StepLayout
      header={
        <View className="min-h-tap flex-row items-center justify-between">
          <HeaderButton
            icon="chevronLeft"
            label={t('common.back')}
            onPress={() => backOr(id ? halvesCaseRoute(id) : ROUTES.halves)}
          />
          {theirs && !theirs.hidden ? (
            <TextButton label={t('halves.move.report')} onPress={() => setReporting(true)} />
          ) : null}
        </View>
      }
    >
      {!found ? (
        <LoadState
          failed={state.phase === 'failed'}
          loadingLabel={t('halves.case.loading')}
          slowLabel={t('common.wakingUp')}
          failedLabel={t('halves.case.loadFailed')}
          retryLabel={t('common.retry')}
          onRetry={refresh}
        />
      ) : !theirs ? (
        <Text tone="muted">{t('halves.case.loadFailed')}</Text>
      ) : (
        <>
          <Reveal>
            <PageHero
              color="tomato"
              icon="volume"
              title={t('halves.move.title', { name: found.partner.name })}
              body={t('halves.move.body')}
            />
          </Reveal>
          <Reveal delay={staggerDelay(1)}>
            <PartnerLine partner={found.partner} />
          </Reveal>
          {theirs.hidden ? (
            <NoticeBox icon="info">{t('halves.move.hidden')}</NoticeBox>
          ) : (
            <>
              <Reveal delay={staggerDelay(2)}>
                <View className="flex-row items-center gap-3">
                  <PlayButton
                    label={playing === 'playing' ? t('halves.move.stop') : t('halves.move.play')}
                    state={playing}
                    onPress={() => void play()}
                  />
                  <Text variant="labelMedium">{t('halves.move.play')}</Text>
                </View>
              </Reveal>
              <Reveal delay={staggerDelay(3)}>
                <ChoiceGroup label={t('halves.move.react')} chips>
                  {REACTIONS.map((reaction) => (
                    <ChoiceChip
                      key={reaction}
                      label={t(`halves.move.reaction.${reaction}`)}
                      selected={theirs.reaction === reaction}
                      onPress={() => void react(reaction)}
                    />
                  ))}
                </ChoiceGroup>
              </Reveal>
              <Reveal delay={staggerDelay(4)}>
                <Card className="gap-3 p-4">
                  <Text variant="labelSmall" tone="muted">
                    {t('halves.move.question')}
                  </Text>
                  <Text variant="section">{theirs.question}</Text>
                  {wrongOnce ? <Text tone="warn">{t('halves.move.wrong')}</Text> : null}
                  {theirs.options.map((option, index) => (
                    <OptionCard
                      key={option}
                      role="radio"
                      label={option}
                      selected={theirs.solution === index}
                      disabled={busy || settled || theirs.answers.includes(index)}
                      onPress={() => void answer(index)}
                    />
                  ))}
                  {settled && theirs.solution !== null ? (
                    <Pop>
                      <Text variant="labelMedium">
                        {theirs.answers[0] === theirs.solution
                          ? t('halves.move.right')
                          : t('halves.move.solution', {
                              answer: theirs.options[theirs.solution],
                            })}
                      </Text>
                    </Pop>
                  ) : null}
                </Card>
              </Reveal>
            </>
          )}
          <ReportSheet visible={reporting} onSend={report} onClose={() => setReporting(false)} />
        </>
      )}
    </StepLayout>
  );
}
