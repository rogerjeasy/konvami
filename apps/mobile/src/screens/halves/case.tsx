import { useEffect, useState } from 'react';
import { Share, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { HalvesCase, HalvesRound } from '@konvami/api-client';
import { apiErrorCode } from '@/api/messages';
import { useSession } from '@/auth';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ConfirmSheet } from '@/components/confirm-sheet';
import { LoadState } from '@/components/load-state';
import { Pop, Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { OptionCard } from '@/components/option-card';
import { PageHero } from '@/components/page-hero';
import { PlayButton } from '@/components/play-button';
import { HeaderButton } from '@/components/step-header';
import { StepLayout } from '@/components/step-layout';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { useHalvesApi, useHalvesCase } from '@/halves/services';
import { commitFeedback, successFeedback } from '@/lib/haptics';
import { staggerDelay } from '@/lib/motion';
import { backOr } from '@/lib/navigation';
import {
  halvesBriefingRoute,
  halvesMineRoute,
  halvesMoveRoute,
  halvesRecordRoute,
  ROUTES,
} from '@/lib/routes';
import { useHome, usePracticeServices } from '@/practice/services';
import { failureKey, PartnerLine, reasonKey, useLanguageName } from './parts';

function RoundCard({ found, round }: { found: HalvesCase; round: HalvesRound }) {
  const { t } = useTranslation();
  const [help, setHelp] = useState(false);
  const mine = round.mine;
  const theirs = round.theirs;
  return (
    <Card className="gap-3 p-4">
      <Text variant="section" accessibilityRole="header">
        {t('halves.round', { round: round.round })}
      </Text>
      {round.clue ? (
        <View className="gap-1.5">
          <Text variant="labelSmall" tone="muted">
            {t('halves.case.yourClue')}
          </Text>
          <Text variant="langLine">{round.clue}</Text>
          {help ? <Text tone="muted">{round.clueHelp}</Text> : null}
          <TextButton
            tone="primary"
            label={help ? t('halves.case.hideHelp') : t('halves.case.showHelp')}
            onPress={() => setHelp((shown) => !shown)}
          />
        </View>
      ) : null}
      {mine ? (
        <View className="gap-1">
          <Text variant="small" tone={mine.status === 'held' ? 'warn' : 'muted'}>
            {t(`halves.case.status.${mine.status}`)}
            {mine.status === 'held' && mine.reasons[0] ? ` (${t(reasonKey(mine.reasons[0]))})` : ''}
          </Text>
          {mine.reasons.includes('self_harm') ? (
            <NoticeBox icon="info">{t('halves.care')}</NoticeBox>
          ) : null}
          {mine.understood !== null ? (
            <Text variant="small">
              {mine.understood ? t('halves.case.understood') : t('halves.case.needed')}
            </Text>
          ) : null}
          {mine.status === 'delivered' ? (
            <TextButton
              tone="primary"
              label={t('halves.case.yourReport')}
              onPress={() => router.push(halvesMineRoute(found.id, mine.id))}
            />
          ) : null}
        </View>
      ) : null}
      {theirs ? (
        <View className="gap-1.5">
          <Text variant="labelSmall" tone="muted">
            {t('halves.case.theirClue', { name: found.partner.name })}
          </Text>
          {theirs.solution !== null ? (
            <Text variant="small">
              {theirs.hidden
                ? t('halves.move.hidden')
                : t('halves.case.answered', { answer: theirs.options[theirs.solution] })}
            </Text>
          ) : (
            <Button
              variant="secondary"
              label={t('halves.case.listen')}
              onPress={() => router.push(halvesMoveRoute(found.id, theirs.id))}
            />
          )}
        </View>
      ) : null}
    </Card>
  );
}

function FinalCard({
  found,
  onChanged,
}: {
  found: HalvesCase;
  onChanged: (c: HalvesCase) => void;
}) {
  const { t } = useTranslation();
  const api = useHalvesApi();
  const [picked, setPicked] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const final = found.final;
  if (!final.open && final.answers.length === 0) return null;
  const tried = final.answers.length > 0 && final.solution === null;

  async function submit() {
    if (picked === null) return;
    commitFeedback();
    setSending(true);
    try {
      onChanged(await api.solveHalvesCase(found.id, picked));
      setPicked(null);
    } finally {
      setSending(false);
    }
  }

  return (
    <Card className="gap-3 p-4">
      <Text variant="section" accessibilityRole="header">
        {t('halves.case.final')}
      </Text>
      <Text>{final.question}</Text>
      <Text variant="small" tone="muted">
        {t('halves.case.finalHint')}
      </Text>
      {final.open ? (
        <>
          {tried ? <Text tone="warn">{t('halves.case.tryAgain')}</Text> : null}
          {final.options.map((option, index) => (
            <OptionCard
              key={option}
              role="radio"
              label={option}
              selected={picked === index}
              disabled={final.answers.includes(index)}
              onPress={() => setPicked(index)}
            />
          ))}
          <Button
            label={t('halves.case.finalSubmit')}
            disabled={picked === null}
            loading={sending}
            onPress={() => void submit()}
          />
        </>
      ) : found.status === 'open' ? (
        <Text tone="muted">{t('halves.case.finalWaiting')}</Text>
      ) : null}
    </Card>
  );
}

function Ended({ found, onChanged }: { found: HalvesCase; onChanged: (c: HalvesCase) => void }) {
  const { t } = useTranslation();
  const api = useHalvesApi();
  const languageName = useLanguageName();
  const { clips } = usePracticeServices();
  const [playing, setPlaying] = useState<number | null>(null);
  const solved = found.status === 'solved';
  const answer = found.final.solution !== null ? found.final.options[found.final.solution] : '';

  useEffect(() => {
    if (solved) successFeedback();
  }, [solved]);
  useEffect(() => () => clips.stop(), [clips]);

  async function play(line: number) {
    commitFeedback();
    if (playing === line) {
      clips.stop();
      setPlaying(null);
      return;
    }
    setPlaying(line);
    try {
      const { url } = await api.getHalvesRecapAudio(found.id, line);
      clips.play(url, () => setPlaying((current) => (current === line ? null : current)));
    } catch {
      setPlaying(null);
    }
  }

  async function again(yes: boolean) {
    commitFeedback();
    onChanged(await api.playHalvesAgain(found.id, yes));
  }

  function share() {
    commitFeedback();
    void Share.share({
      message: t('halves.case.shareText', {
        title: found.title,
        result: solved ? t('halves.case.solved') : t('halves.case.unsolved'),
        speaks: languageName(found.speaks),
        hears: languageName(found.hears),
      }),
    });
  }

  return (
    <View className="gap-3">
      <Pop>
        <Card className="items-center gap-2 p-5">
          <Text variant="title" accessibilityRole="header" className="text-center">
            {solved ? t('halves.case.solved') : t('halves.case.unsolved')}
          </Text>
          {!solved && answer ? (
            <Text tone="muted" className="text-center">
              {t('halves.case.unsolvedBody', { answer })}
            </Text>
          ) : null}
        </Card>
      </Pop>
      <Card className="gap-2.5 p-4">
        <Text variant="section" accessibilityRole="header">
          {t('halves.case.recap')}
        </Text>
        {found.recap.length === 0 ? (
          <Text tone="muted">{t('halves.case.recapPending')}</Text>
        ) : (
          found.recap.map((line, index) => (
            <View key={`${index}-${line.text}`} className="flex-row items-start gap-2.5">
              {line.hasAudio ? (
                <PlayButton
                  label={line.text}
                  state={playing === index ? 'playing' : 'idle'}
                  onPress={() => void play(index)}
                />
              ) : null}
              <Text variant="langLine" className="flex-1">
                {line.text}
              </Text>
            </View>
          ))
        )}
      </Card>
      {found.askAgain ? (
        <Card className="gap-2.5 p-4">
          <Text variant="section">{t('halves.case.again', { name: found.partner.name })}</Text>
          <Text variant="small" tone="muted">
            {t('halves.case.againHint')}
          </Text>
          <View className="flex-row gap-2.5">
            <View className="flex-1">
              <Button label={t('halves.case.yes')} onPress={() => void again(true)} />
            </View>
            <View className="flex-1">
              <Button
                variant="secondary"
                label={t('halves.case.no')}
                onPress={() => void again(false)}
              />
            </View>
          </View>
        </Card>
      ) : found.again !== null ? (
        <Text tone="muted">
          {found.again ? t('halves.case.againYes') : t('halves.case.againNo')}
        </Text>
      ) : null}
      <Button variant="secondary" label={t('halves.case.share')} onPress={share} />
    </View>
  );
}

/**
 * 7.4 A Two Halves case as the learner's seat sees it: their clues by round, what happened to
 * their moves, the clues the other player sent, the case's question and, at the end (7.8), the
 * result, the recap scene and "play again?". The briefing (7.5) is a call with their partner.
 */
export function HalvesCaseScreen() {
  const { t } = useTranslation();
  const { status } = useSession();
  const signedIn = status === 'signedIn';
  const { id } = useLocalSearchParams<{ id: string }>();
  const api = useHalvesApi();
  const { home: homeStore } = usePracticeServices();
  const home = useHome();
  const { state, refresh, set } = useHalvesCase(signedIn ? (id ?? null) : null);
  const [sheet, setSheet] = useState<'handOver' | 'block' | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    if (signedIn) void homeStore.load();
  }, [signedIn, homeStore]);

  async function confirm() {
    if (!sheet || state.phase !== 'ready') return;
    setBusy(true);
    try {
      set(
        sheet === 'block'
          ? await api.blockHalvesPartner(state.data.id)
          : await api.handOverHalvesSeat(state.data.id),
      );
      setSheet(null);
    } catch (error) {
      setFailure(t(failureKey(apiErrorCode(error))));
    } finally {
      setBusy(false);
    }
  }

  if (!signedIn) return <Redirect href={ROUTES.welcome} />;
  const found = state.phase === 'ready' ? state.data : null;
  const partner =
    home.phase === 'ready'
      ? (home.data.partners.find(({ persona }) => persona.id === home.data.suggestedPartnerId)
          ?.persona ?? home.data.partners[0]?.persona)
      : undefined;
  const recordRound = found?.status === 'open' ? found.recordRound : null;
  return (
    <StepLayout
      header={
        <View className="min-h-tap flex-row items-center">
          <HeaderButton
            icon="chevronLeft"
            label={t('common.back')}
            onPress={() => backOr(ROUTES.halves)}
          />
        </View>
      }
      actions={
        found && recordRound ? (
          <View className="gap-2">
            <Button
              label={t('halves.case.record', { round: recordRound })}
              onPress={() => router.push(halvesRecordRoute(found.id))}
            />
            {partner ? (
              <TextButton
                tone="primary"
                label={t('halves.case.rehearse', { name: partner.name })}
                onPress={() => router.push(halvesBriefingRoute(partner.id, found.id))}
              />
            ) : null}
          </View>
        ) : undefined
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
      ) : (
        <>
          <Reveal>
            <PageHero color="tomato" icon="compass" title={found.title} body={found.setting} />
          </Reveal>
          <Reveal delay={staggerDelay(1)}>
            <PartnerLine partner={found.partner} />
          </Reveal>
          {failure ? (
            <NoticeBox icon="info" tone="warn">
              {failure}
            </NoticeBox>
          ) : null}
          {found.status !== 'open' ? <Ended found={found} onChanged={set} /> : null}
          <FinalCard found={found} onChanged={set} />
          {found.rounds.map((round, index) =>
            round.clue || round.mine || round.theirs ? (
              <Reveal key={round.round} delay={staggerDelay(2 + index)}>
                <RoundCard found={found} round={round} />
              </Reveal>
            ) : null,
          )}
          {found.status === 'open' && !recordRound && !found.final.open ? (
            <Text tone="muted">{t('halves.case.waiting')}</Text>
          ) : null}
          {found.status === 'open' && recordRound && partner ? (
            <Text variant="small" tone="muted">
              {t('halves.case.briefing')}
            </Text>
          ) : null}
          {found.canHandOver ? (
            <TextButton
              tone="primary"
              label={t('halves.case.handOver')}
              onPress={() => setSheet('handOver')}
            />
          ) : null}
          {!found.partner.ai ? (
            <TextButton label={t('halves.case.block')} onPress={() => setSheet('block')} />
          ) : null}
          <ConfirmSheet
            visible={sheet !== null}
            title={sheet === 'block' ? t('halves.case.block') : t('halves.case.handOver')}
            body={
              sheet === 'block'
                ? t('halves.case.blockBody')
                : t('halves.case.handOverBody', { name: found.partner.name })
            }
            confirmLabel={sheet === 'block' ? t('halves.case.block') : t('halves.case.handOver')}
            cancelLabel={t('halves.case.cancel')}
            danger={sheet === 'block'}
            loading={busy}
            onConfirm={() => void confirm()}
            onCancel={() => setSheet(null)}
          />
        </>
      )}
    </StepLayout>
  );
}
