import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Quest, Recap, RepairOffer, WelcomeBack } from '@konvami/api-client';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { QuestList } from '@/components/quest-list';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { Tile } from '@/components/tile';
import { formatDate, formatDayOfYear, formatList } from '@/lib/format';

// The calendar day of a stored moment ("2026-10-09T12:00:00Z" → "2026-10-09").
const DAY_LENGTH = 'YYYY-MM-DD'.length;

/**
 * A planned day slipped by and speaking today still repairs it: a warm offer to pick it up with
 * the suggested partner, never a loss (butter, the streak's block; spec §14.3).
 */
export function RepairCard({
  repair,
  days,
  partnerName,
  onTalk,
}: {
  repair: RepairOffer;
  /** The streak it keeps going. */
  days: number;
  partnerName: string;
  onTalk: () => void;
}) {
  const { t, i18n } = useTranslation();
  return (
    <Tile color="butter" className="gap-3">
      <Text variant="heading" tone="onButter" accessibilityRole="header">
        {t('motivation.repair.title', { name: partnerName })}
      </Text>
      <Text variant="body" tone="onButter">
        {t('motivation.repair.body', {
          day: formatDayOfYear(i18n.language, repair.until),
          count: days,
        })}
      </Text>
      <Button
        variant="secondary"
        label={t('motivation.repair.action', { name: partnerName })}
        onPress={onTalk}
      />
    </Tile>
  );
}

/** The week's three quests on Today, with the way to 5.27 (butter: the week is butter). */
export function QuestsCard({ quests, onOpen }: { quests: readonly Quest[]; onOpen: () => void }) {
  const { t } = useTranslation();
  return (
    <Tile color="butter" className="gap-3.5">
      <Text variant="overline" tone="onButter" accessibilityRole="header">
        {t('motivation.quests.title')}
      </Text>
      <QuestList quests={quests} />
      <View className="items-start">
        <TextButton label={t('motivation.quests.open')} onPress={onOpen} />
      </View>
    </Tile>
  );
}

/**
 * After a quiet week: a welcome back from the partner talked to last, with what they remember to
 * ask about (shown here only, never in a push), and one tap to pause reminders for a month.
 */
export function WelcomeBackCard({
  welcome,
  partnerName,
  pausedUntil,
  failed,
  onTalk,
  onPause,
  onResume,
}: {
  welcome: WelcomeBack;
  partnerName: string;
  /** Until when reminders are paused; null while they are on. */
  pausedUntil: string | null;
  /** The last pause or resume did not reach the server. */
  failed: boolean;
  onTalk: () => void;
  onPause: () => void;
  onResume: () => void;
}) {
  const { t, i18n } = useTranslation();
  return (
    <Tile color="tomato" className="gap-3">
      <Text variant="heading" tone="onTomato" accessibilityRole="header">
        {t('motivation.welcome.title')}
      </Text>
      {welcome.question ? (
        <Text variant="emphasis" tone="onTomato">
          {welcome.question}
        </Text>
      ) : null}
      <Text variant="body" tone="onTomato">
        {t('motivation.welcome.body', { name: partnerName })}
      </Text>
      <Button
        variant="secondary"
        label={t('motivation.welcome.talk', { name: partnerName })}
        onPress={onTalk}
      />
      {pausedUntil ? (
        <View className="gap-1">
          <Text variant="small" tone="onTomato">
            {t('motivation.welcome.paused', {
              date: formatDate(i18n.language, pausedUntil.slice(0, DAY_LENGTH)),
            })}
          </Text>
          <View className="items-start">
            <TextButton label={t('motivation.welcome.resume')} onPress={onResume} />
          </View>
        </View>
      ) : (
        <View className="items-start">
          <TextButton label={t('motivation.welcome.pause')} onPress={onPause} />
        </View>
      )}
      {failed ? (
        <Text variant="small" tone="onTomato" accessibilityRole="alert">
          {t('motivation.welcome.pauseFailed')}
        </Text>
      ) : null}
    </Tile>
  );
}

/**
 * Monday's look back (until Wednesday, or until closed): last week's speaking, quests and new
 * milestones, the kinds of mistake that came up less, and a fresh start.
 */
export function RecapCard({
  recap,
  freshStart,
  milestoneName,
  onClose,
}: {
  recap: Recap;
  freshStart: boolean;
  milestoneName: (id: string) => string;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const numbers = [
    t('motivation.recap.minutes', { count: recap.minutes }),
    t('motivation.recap.conversations', { count: recap.conversations }),
    t('motivation.recap.days', { count: recap.speakingDays }),
  ];
  const kinds = recap.improved.map((kind) =>
    t(`report.category.${kind}` as 'report.category.other', {
      defaultValue: t('report.category.other'),
    }),
  );
  return (
    <Card className="gap-2.5 p-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 gap-0.5">
          <Text variant="overline" tone="subtle" accessibilityRole="header">
            {t('motivation.recap.title')}
          </Text>
          {freshStart ? <Text variant="heading">{t('motivation.recap.fresh')}</Text> : null}
        </View>
        <TextButton label={t('motivation.recap.close')} onPress={onClose} />
      </View>
      <Text variant="body">{formatList(i18n.language, numbers)}</Text>
      {recap.questsTotal > 0 ? (
        <Text variant="small" tone="muted">
          {t('motivation.recap.quests', { done: recap.questsDone, total: recap.questsTotal })}
        </Text>
      ) : null}
      {recap.milestones.length ? (
        <Text variant="small" tone="muted">
          {t('motivation.recap.milestones', {
            names: formatList(i18n.language, recap.milestones.map(milestoneName)),
          })}
        </Text>
      ) : null}
      {kinds.length ? (
        <Text variant="small" tone="muted">
          {t('motivation.recap.improved', { kinds: formatList(i18n.language, kinds) })}
        </Text>
      ) : null}
    </Card>
  );
}
