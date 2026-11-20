import { useEffect, useState, useSyncExternalStore } from 'react';
import { View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { LifeEvent, Persona } from '@konvami/api-client';
import { useSession } from '@/auth';
import { Button } from '@/components/button';
import { ChoiceChip } from '@/components/choice-chip';
import { ChoiceGroup } from '@/components/choice-group';
import { Icon } from '@/components/icon';
import { ListGroup, ListRow } from '@/components/list';
import { LoadState } from '@/components/load-state';
import { Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { Sheet } from '@/components/sheet';
import { HeaderButton } from '@/components/step-header';
import { StepLayout } from '@/components/step-layout';
import { PageHero } from '@/components/page-hero';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { useRolePlays, ownRolePlay, type RolePlayView } from '@/hooks/use-role-plays';
import { formatShortDate } from '@/lib/format';
import { commitFeedback } from '@/lib/haptics';
import { staggerDelay } from '@/lib/motion';
import { backOr } from '@/lib/navigation';
import { callRoute, debriefCallRoute, ownScenarioRoute, ROUTES } from '@/lib/routes';
import { useHome, usePracticeServices } from '@/practice/services';
import { useTheme } from '@/theme';
import { size } from '@konvami/design-tokens';

/**
 * One role-play before it starts: the situation, who the partner plays (an own one says), the
 * goals, and which partner plays the other person. Starting closes the sheet and opens the call;
 * an own role-play can be changed or deleted from here.
 */
function ScenarioSheet({
  scenario,
  partners,
  preferred,
  onClose,
}: {
  scenario: RolePlayView | null;
  partners: readonly Persona[];
  /** The partner to offer first (the one who heard about the event, for a rehearsal). */
  preferred?: string | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { color } = useTheme();
  const { removeScene } = usePracticeServices();
  const [chosen, setChosen] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const partnerId =
    chosen ??
    (preferred && partners.some((p) => p.id === preferred) ? preferred : null) ??
    partners[0]?.id ??
    null;
  const close = () => {
    setChosen(null);
    onClose();
  };
  const own = scenario?.own ?? null;
  return (
    <Sheet icon="users" visible={scenario !== null} title={scenario?.title ?? ''} onClose={close}>
      {scenario ? (
        <View className="gap-5 pt-1">
          {scenario.character ? (
            <View className="gap-1">
              <Text variant="labelMedium">{t('realLife.character')}</Text>
              <Text tone="muted">{scenario.character}</Text>
            </View>
          ) : null}
          <Text tone="muted">{scenario.situation}</Text>
          <View className="gap-2">
            <Text variant="labelMedium">{t('rolePlays.goals')}</Text>
            {scenario.goals.map((goal) => (
              <View key={goal.id} className="flex-row items-start gap-2.5">
                <Icon name="target" color={color.primaryText} size={size.iconMd} />
                <Text className="flex-1">{goal.label}</Text>
              </View>
            ))}
          </View>
          <ChoiceGroup label={t('rolePlays.who')} chips>
            {partners.map((partner) => (
              <ChoiceChip
                key={partner.id}
                label={partner.name}
                selected={partner.id === partnerId}
                onPress={() => setChosen(partner.id)}
              />
            ))}
          </ChoiceGroup>
          <Button
            label={t('rolePlays.start')}
            disabled={partnerId === null}
            onPress={() => {
              if (partnerId === null) return;
              commitFeedback();
              close();
              router.push(callRoute(partnerId, { scenario: scenario.id }));
            }}
          />
          {own ? (
            <View className="flex-row flex-wrap justify-center gap-4">
              <TextButton
                tone="primary"
                label={t('realLife.edit')}
                onPress={() => {
                  close();
                  router.push(ownScenarioRoute(own.id));
                }}
              />
              <TextButton
                tone="muted"
                label={t('realLife.remove')}
                disabled={removing}
                onPress={() => {
                  setRemoving(true);
                  void removeScene(own.id)
                    .then(close, () => {})
                    .finally(() => setRemoving(false));
                }}
              />
            </View>
          ) : null}
        </View>
      ) : null}
    </Sheet>
  );
}

/** Events of the learner's life: to rehearse before (5.13) and to talk over after. */
function useRealLife() {
  const { realLife } = usePracticeServices();
  useEffect(() => {
    void realLife.load();
  }, [realLife]);
  return useSyncExternalStore(realLife.subscribe, realLife.getState, realLife.getState);
}

function LifeSection({
  partners,
  onRehearse,
}: {
  partners: readonly Persona[];
  onRehearse: (event: LifeEvent) => void;
}) {
  const { t, i18n } = useTranslation();
  const { clock } = usePracticeServices();
  const life = useRealLife();
  if (life.phase !== 'ready') return null;
  const { comingUp, toDebrief } = life.data;
  if (comingUp.length === 0 && toDebrief.length === 0) return null;
  const now = new Date(clock.now());
  const day = (event: LifeEvent) => formatShortDate(i18n.language, event.day, now);
  const partnerOf = (event: LifeEvent) =>
    partners.find((p) => p.id === event.partnerId) ?? partners[0];
  return (
    <View className="gap-4">
      {comingUp.length > 0 ? (
        <View className="gap-2">
          <Text variant="heading" accessibilityRole="header">
            {t('realLife.comingTitle')}
          </Text>
          <Text tone="muted">{t('realLife.comingHint')}</Text>
          <ListGroup>
            {comingUp.map((event) => (
              <ListRow
                key={event.memoryId}
                icon="calendar"
                title={event.text}
                detail={day(event)}
                badge={event.done ? t('realLife.rehearsed') : t('realLife.rehearse')}
                accessibilityLabel={t('realLife.rehearseLabel', {
                  event: event.text,
                  day: day(event),
                })}
                onPress={() => onRehearse(event)}
              />
            ))}
          </ListGroup>
        </View>
      ) : null}
      {toDebrief.length > 0 ? (
        <View className="gap-2">
          <Text variant="heading" accessibilityRole="header">
            {t('realLife.debriefTitle')}
          </Text>
          <Text tone="muted">{t('realLife.debriefHint')}</Text>
          <ListGroup>
            {toDebrief.map((event) => {
              const partner = partnerOf(event);
              return (
                <ListRow
                  key={event.memoryId}
                  icon="message"
                  title={event.text}
                  detail={day(event)}
                  badge={t('realLife.debrief')}
                  accessibilityLabel={t('realLife.debriefLabel', {
                    event: event.text,
                    day: day(event),
                  })}
                  onPress={() => {
                    if (!partner) return;
                    commitFeedback();
                    router.push(debriefCallRoute(partner.id, event.memoryId));
                  }}
                />
              );
            })}
          </ListGroup>
        </View>
      ) : null}
    </View>
  );
}

/**
 * 5.13 Role-plays (spec §6.3): what is coming up in the learner's life, to rehearse before the
 * day, and what happened, to talk over (spec §7 "rehearse, then debrief"); the learner's own
 * role-plays (5.31); then the real-life situations of the language learned, easiest first. One
 * opens with its goals and a choice of partner, and starts as a call in which the partner plays
 * the other person.
 */
export function RolePlaysScreen() {
  const { t } = useTranslation();
  const { status } = useSession();
  const reading = useRolePlays();
  const home = useHome();
  const { rehearseEvent } = usePracticeServices();
  const [open, setOpen] = useState<{ play: RolePlayView; preferred?: string | null } | null>(null);
  const [preparing, setPreparing] = useState<'busy' | 'failed' | null>(null);

  if (status !== 'signedIn') return <Redirect href={ROUTES.welcome} />;
  const partners = home.phase === 'ready' ? home.data.partners.map(({ persona }) => persona) : [];

  function rehearse(event: LifeEvent) {
    setPreparing('busy');
    void rehearseEvent(event.memoryId).then(
      (rehearsal) => {
        setPreparing(null);
        setOpen({ play: ownRolePlay(t, rehearsal), preferred: event.partnerId });
      },
      () => setPreparing('failed'),
    );
  }

  const own = (reading.own ?? []).filter((play) => play.own?.source === 'custom');
  return (
    <StepLayout
      header={
        <View className="min-h-tap flex-row items-center">
          <HeaderButton
            icon="chevronLeft"
            label={t('common.back')}
            onPress={() => backOr(ROUTES.talk)}
          />
        </View>
      }
    >
      <Reveal>
        <PageHero
          color="tomato"
          icon="users"
          title={t('rolePlays.title')}
          body={t('rolePlays.body')}
        />
      </Reveal>
      <Reveal delay={staggerDelay(1)}>
        <LifeSection partners={partners} onRehearse={rehearse} />
      </Reveal>
      {preparing ? (
        <NoticeBox icon="info">
          {t(preparing === 'busy' ? 'realLife.preparing' : 'realLife.failed')}
        </NoticeBox>
      ) : null}
      <Reveal delay={staggerDelay(2)}>
        <View className="gap-2">
          <Text variant="heading" accessibilityRole="header">
            {t('realLife.ownTitle')}
          </Text>
          <Text tone="muted">{t('realLife.ownHint')}</Text>
          {own.length > 0 ? (
            <ListGroup>
              {own.map((play) => (
                <ListRow
                  key={play.id}
                  icon="edit"
                  title={play.title}
                  badge={play.level}
                  detail={play.situation}
                  accessibilityLabel={t('rolePlays.scenarioLabel', {
                    title: play.title,
                    level: play.level,
                  })}
                  onPress={() => setOpen({ play })}
                />
              ))}
            </ListGroup>
          ) : null}
          <Button
            variant="secondary"
            label={t('realLife.create')}
            onPress={() => router.push(ownScenarioRoute())}
          />
        </View>
      </Reveal>
      {reading.phase === 'ready' && reading.catalog ? (
        <Reveal delay={staggerDelay(3)}>
          <ListGroup>
            {reading.catalog.map((play) => (
              <ListRow
                key={play.id}
                icon="users"
                title={play.title}
                badge={play.level}
                detail={play.situation}
                accessibilityLabel={t('rolePlays.scenarioLabel', {
                  title: play.title,
                  level: play.level,
                })}
                onPress={() => setOpen({ play })}
              />
            ))}
          </ListGroup>
        </Reveal>
      ) : (
        <LoadState
          failed={reading.phase === 'failed'}
          loadingLabel={t('rolePlays.loading')}
          slowLabel={t('common.wakingUp')}
          failedLabel={t('rolePlays.loadFailed')}
          retryLabel={t('common.retry')}
          onRetry={reading.retry}
        />
      )}
      <ScenarioSheet
        scenario={open?.play ?? null}
        preferred={open?.preferred}
        partners={partners}
        onClose={() => setOpen(null)}
      />
    </StepLayout>
  );
}
