import { useState } from 'react';
import { View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { ChainSeatChoice } from '@konvami/api-client';
import { size } from '@konvami/design-tokens';
import { apiErrorCode } from '@/api/messages';
import { useSession } from '@/auth';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ChoiceChip } from '@/components/choice-chip';
import { ChoiceGroup } from '@/components/choice-group';
import { Icon } from '@/components/icon';
import { LoadState } from '@/components/load-state';
import { Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { OptionCard } from '@/components/option-card';
import { PageHero } from '@/components/page-hero';
import { HeaderButton } from '@/components/step-header';
import { StepLayout } from '@/components/step-layout';
import { Text } from '@/components/text';
import { useChainApi, useChainHub } from '@/chain/services';
import { commitFeedback } from '@/lib/haptics';
import { staggerDelay } from '@/lib/motion';
import { backOr } from '@/lib/navigation';
import { chainInviteRoute, chainTurnRoute, ROUTES } from '@/lib/routes';
import { useTheme } from '@/theme';
import { failureKey, genreIcon } from './parts';

// The three seats beside the learner's own (seat 1).
const OTHER_SEATS = [2, 3, 4] as const;
// "Surprise me": no opening chosen, the server picks one.
const SURPRISE = 'surprise';

/** Who sits in a seat: an AI character, a friend with a code, or one of the learner's duos. */
type SeatPick = { kind: 'ai' } | { kind: 'friend' } | { kind: 'duo'; duoId: string };

/**
 * 9.3 A new story: how it begins (an opening of a genre, or a surprise) and who sits at the
 * table. Minors play with AI characters only; adults may seat friends by code and their Two
 * Halves duos.
 */
export function ChainSetupScreen() {
  const { t } = useTranslation();
  const { color } = useTheme();
  const { status } = useSession();
  const signedIn = status === 'signedIn';
  const api = useChainApi();
  const { state, refresh } = useChainHub(signedIn);
  const [opening, setOpening] = useState<string>(SURPRISE);
  const [seats, setSeats] = useState<Record<number, SeatPick>>({
    2: { kind: 'ai' },
    3: { kind: 'ai' },
    4: { kind: 'ai' },
  });
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  if (!signedIn) return <Redirect href={ROUTES.welcome} />;
  const hub = state.phase === 'ready' ? state.data : null;
  const adult = hub?.profile?.band === 'adult';

  async function start() {
    commitFeedback();
    setBusy(true);
    setFailure(null);
    const chosen: ChainSeatChoice[] = OTHER_SEATS.map((seat) => {
      const pick = seats[seat] ?? { kind: 'ai' };
      return pick.kind === 'duo' ? { kind: 'duo', duoId: pick.duoId } : { kind: pick.kind };
    });
    try {
      const story = await api.startChainStory({
        openingId: opening === SURPRISE ? null : opening,
        seats: chosen,
      });
      router.replace(story.inviteCode ? chainInviteRoute(story.id) : chainTurnRoute(story.id));
    } catch (error) {
      setFailure(t(failureKey(apiErrorCode(error))));
    } finally {
      setBusy(false);
    }
  }

  // A duo sits in one seat at most.
  const duoTaken = (duoId: string, seat: number) =>
    OTHER_SEATS.some((other) => {
      const pick = seats[other];
      return other !== seat && pick?.kind === 'duo' && pick.duoId === duoId;
    });

  return (
    <StepLayout
      header={
        <View className="min-h-tap flex-row items-center">
          <HeaderButton
            icon="chevronLeft"
            label={t('common.back')}
            onPress={() => backOr(ROUTES.chain)}
          />
        </View>
      }
      actions={
        hub ? (
          <Button label={t('chain.setup.start')} loading={busy} onPress={() => void start()} />
        ) : undefined
      }
    >
      <Reveal>
        <PageHero
          color="pink"
          icon="edit"
          title={t('chain.setup.title')}
          body={t('chain.setup.body')}
        />
      </Reveal>
      {!hub ? (
        <LoadState
          failed={state.phase === 'failed'}
          loadingLabel={t('chain.loading')}
          slowLabel={t('common.wakingUp')}
          failedLabel={t('chain.loadFailed')}
          retryLabel={t('common.retry')}
          onRetry={refresh}
        />
      ) : (
        <>
          <Reveal delay={staggerDelay(1)}>
            <View accessibilityRole="radiogroup" className="gap-2.5">
              <Text variant="section" accessibilityRole="header">
                {t('chain.setup.opening')}
              </Text>
              <OptionCard
                role="radio"
                label={t('chain.setup.surprise')}
                description={t('chain.setup.surpriseHint')}
                selected={opening === SURPRISE}
                leading={<Icon name="gift" color={color.fg} size={size.iconMd} />}
                onPress={() => setOpening(SURPRISE)}
              />
              {hub.openings.map((one) => (
                <OptionCard
                  key={one.id}
                  role="radio"
                  label={one.title}
                  description={t(`chain.genre.${one.genre}`, { defaultValue: one.genre })}
                  selected={opening === one.id}
                  leading={<Icon name={genreIcon(one.genre)} color={color.fg} size={size.iconMd} />}
                  onPress={() => setOpening(one.id)}
                />
              ))}
            </View>
          </Reveal>
          <Reveal delay={staggerDelay(2)}>
            <View className="gap-2.5">
              <Text variant="section" accessibilityRole="header">
                {t('chain.setup.table')}
              </Text>
              {!adult ? (
                <NoticeBox icon="info">{t('chain.setup.adultsOnly')}</NoticeBox>
              ) : (
                OTHER_SEATS.map((seat) => {
                  const pick = seats[seat] ?? { kind: 'ai' };
                  const set = (next: SeatPick) => setSeats((now) => ({ ...now, [seat]: next }));
                  return (
                    <Card key={seat} className="gap-1 p-4">
                      <ChoiceGroup label={t('chain.setup.seat', { seat })} chips>
                        <ChoiceChip
                          label={t('chain.setup.seatAi')}
                          selected={pick.kind === 'ai'}
                          onPress={() => set({ kind: 'ai' })}
                        />
                        <ChoiceChip
                          label={t('chain.setup.seatFriend')}
                          selected={pick.kind === 'friend'}
                          onPress={() => set({ kind: 'friend' })}
                        />
                        {hub.duos
                          .filter((duo) => !duoTaken(duo.id, seat))
                          .map((duo) => (
                            <ChoiceChip
                              key={duo.id}
                              label={t('chain.setup.seatDuo', { codename: duo.codename })}
                              selected={pick.kind === 'duo' && pick.duoId === duo.id}
                              onPress={() => set({ kind: 'duo', duoId: duo.id })}
                            />
                          ))}
                      </ChoiceGroup>
                      <Text variant="small" tone="muted">
                        {pick.kind === 'ai'
                          ? t('chain.setup.seatAiHint')
                          : pick.kind === 'friend'
                            ? t('chain.setup.seatFriendHint')
                            : t('chain.setup.seatDuoHint')}
                      </Text>
                    </Card>
                  );
                })
              )}
            </View>
          </Reveal>
          {failure ? (
            <NoticeBox icon="info" tone="warn">
              {failure}
            </NoticeBox>
          ) : null}
        </>
      )}
    </StepLayout>
  );
}
