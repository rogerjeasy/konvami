import { useEffect, useState, useSyncExternalStore } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { HomePartner, LifeEvent, Persona } from '@konvami/api-client';
import { ListGroup, ListRow } from '@/components/list';
import { NoticeBox } from '@/components/notice-box';
import { formatShortDate } from '@/lib/format';
import { commitFeedback } from '@/lib/haptics';
import { callRoute, debriefCallRoute } from '@/lib/routes';
import { usePracticeServices } from '@/practice/services';

// Today offers a rehearsal only this close to the event; 5.13 lists the rest.
const REHEARSE_WITHIN_DAYS = 7;

/** What Today offers about one event of the learner's life. */
export interface RealLifeOffer {
  event: LifeEvent;
  /** After the event: talk it over; before it: rehearse it. */
  kind: 'debrief' | 'rehearse';
  partner: Persona;
}

/** What Today offers about the learner's life, if anything. */
export function useRealLifeOffer(
  partners: readonly HomePartner[],
  now: Date,
): RealLifeOffer | null {
  const { realLife } = usePracticeServices();
  useEffect(() => {
    void realLife.load();
  }, [realLife]);
  const life = useSyncExternalStore(realLife.subscribe, realLife.getState, realLife.getState);
  if (life.phase !== 'ready') return null;
  const debrief = life.data.toDebrief[0];
  const soon = life.data.comingUp.find((event) => {
    const days = (Date.parse(`${event.day}T12:00:00`) - now.getTime()) / 86_400_000;
    return !event.done && days <= REHEARSE_WITHIN_DAYS;
  });
  const event = debrief ?? soon;
  if (!event) return null;
  const partner = (partners.find(({ persona }) => persona.id === event.partnerId) ?? partners[0])
    ?.persona;
  return partner ? { event, kind: debrief ? 'debrief' : 'rehearse', partner } : null;
}

/**
 * Today's card for real life (spec §7 "rehearse, then debrief"): after an event the learner told
 * a partner about, that partner asks how it went; before one, it offers to rehearse it. One at a
 * time, the event that has happened first: a reminder of the day after an event lands here.
 */
export function RealLifeCard({ offer, now }: { offer: RealLifeOffer; now: Date }) {
  const { t, i18n } = useTranslation();
  const { rehearseEvent } = usePracticeServices();
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const { event, partner } = offer;
  const day = formatShortDate(i18n.language, event.day, now);

  function rehearse(found: LifeEvent, partnerId: string) {
    commitFeedback();
    setBusy(true);
    setFailed(false);
    void rehearseEvent(found.memoryId).then(
      (rehearsal) => {
        setBusy(false);
        router.push(callRoute(partnerId, { scenario: rehearsal.scenario }));
      },
      () => {
        setBusy(false);
        setFailed(true);
      },
    );
  }

  return (
    <View className="gap-2">
      <ListGroup>
        {offer.kind === 'debrief' ? (
          <ListRow
            icon="message"
            title={t('realLife.todayDebrief.title')}
            detail={t('realLife.todayDebrief.body', { event: event.text, day })}
            badge={t('realLife.todayDebrief.action', { name: partner.name })}
            onPress={() => {
              commitFeedback();
              router.push(debriefCallRoute(partner.id, event.memoryId));
            }}
          />
        ) : (
          <ListRow
            icon="calendar"
            title={t('realLife.todayRehearse.title', { event: event.text })}
            detail={t('realLife.todayRehearse.body', { day })}
            badge={t('realLife.todayRehearse.action', { name: partner.name })}
            disabled={busy}
            onPress={() => rehearse(event, partner.id)}
          />
        )}
      </ListGroup>
      {busy ? <NoticeBox icon="info">{t('realLife.preparing')}</NoticeBox> : null}
      {failed ? <NoticeBox icon="info">{t('realLife.failed')}</NoticeBox> : null}
    </View>
  );
}
