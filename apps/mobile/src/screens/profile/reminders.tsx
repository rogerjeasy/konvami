import { useEffect } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import { Card } from '@/components/card';
import { ToggleRow } from '@/components/choice-group';
import { Icon } from '@/components/icon';
import { Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { Section } from '@/components/section';
import { Stepper } from '@/components/stepper';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { openAppSettings } from '@/lib/external';
import { formatTimeOfDay } from '@/lib/format';
import { staggerDelay } from '@/lib/motion';
import { ROUTES } from '@/lib/routes';
import { useHome, usePracticeServices } from '@/practice/services';
import { setReminders, usePreferences } from '@/preferences';
import {
  DEFAULT_REMINDERS,
  REMINDER_TIMES,
  upcomingReminders,
  type ReminderSettings,
} from '@/reminders/schedule';
import { useReminderPermission } from '@/reminders/services';
import { useReminderSchedule } from '@/reminders/use-reminders';
import { useTheme } from '@/theme';
import { ProfilePage } from './page';

/** "Saturday, 18:00": when the next reminder comes, on the device's clock. */
function formatWhen(locale: string, at: Date): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    hour: 'numeric',
    minute: '2-digit',
  }).format(at);
}

/**
 * 6.13 Reminders (spec §6.18): whether this phone reminds the learner on their practice days,
 * at which time, and also of waiting cards, with when the next one comes. A change is kept at
 * once and the reminders are scheduled again. Where the phone does not allow notifications the
 * screen says so and opens its settings.
 */
export function RemindersScreen() {
  const { t, i18n } = useTranslation();
  const { color } = useTheme();
  const { home: store, clock } = usePracticeServices();
  const home = useHome();
  const { reminders } = usePreferences();
  const { permission, ask } = useReminderPermission();
  const data = home.phase === 'ready' ? home.data : null;
  const now = new Date(clock.now());
  useReminderSchedule(data, now);

  useEffect(() => {
    void store.load();
  }, [store]);

  const settings = reminders ?? { ...DEFAULT_REMINDERS, on: false };
  const allowed = permission === 'granted';
  const on = settings.on && allowed;
  const change = (next: Partial<ReminderSettings>) => void setReminders({ ...settings, ...next });

  async function turn(value: boolean) {
    if (!value) return change({ on: false });
    const answer = allowed ? permission : await ask(t('reminders.channel'));
    change({ on: answer === 'granted' });
  }

  const next =
    on && data
      ? upcomingReminders({
          now,
          plan: data.plan,
          notes: data.reminders,
          cardsDue: data.cardsDue,
          practisedToday: data.activity.practisedToday,
          settings,
        })[0]
      : undefined;

  return (
    <ProfilePage
      hero={{ color: 'butter', icon: 'clock' }}
      title={t('profile.reminders.title')}
      body={t('profile.reminders.body')}
      backTo={ROUTES.account}
    >
      {permission === 'unsupported' ? (
        <Reveal delay={staggerDelay(1)}>
          <NoticeBox icon="info">{t('profile.reminders.unsupported')}</NoticeBox>
        </Reveal>
      ) : permission === null ? null : (
        <>
          {permission === 'denied' ? (
            <Reveal delay={staggerDelay(1)}>
              <View className="gap-1">
                <NoticeBox icon="alert">{t('profile.reminders.denied')}</NoticeBox>
                <View className="items-start">
                  <TextButton
                    tone="primary"
                    label={t('profile.reminders.openSettings')}
                    onPress={openAppSettings}
                  />
                </View>
              </View>
            </Reveal>
          ) : null}
          <Reveal delay={staggerDelay(2)}>
            <Card className="gap-5 p-5">
              <ToggleRow label={t('profile.reminders.on')} value={on} onChange={turn} />
              {on ? (
                <>
                  <Stepper
                    title={t('profile.reminders.time')}
                    options={REMINDER_TIMES}
                    value={settings.time}
                    onChange={(time) => change({ time })}
                    number={(time) => formatTimeOfDay(i18n.language, time)}
                    label={(time) => formatTimeOfDay(i18n.language, time)}
                    lessLabel={t('common.earlier', { what: t('profile.reminders.time') })}
                    moreLabel={t('common.later', { what: t('profile.reminders.time') })}
                  />
                  {data ? (
                    <View
                      accessibilityLiveRegion="polite"
                      className="flex-row items-center gap-3 rounded-field bg-butter px-4 py-3"
                    >
                      <Icon name="clock" color={color.onButter} size={size.iconMd} />
                      <Text variant="labelSmall" tone="onButter" className="shrink">
                        {next
                          ? t('profile.reminders.next', {
                              when: formatWhen(i18n.language, next.at),
                            })
                          : t('profile.reminders.none')}
                      </Text>
                    </View>
                  ) : null}
                </>
              ) : null}
            </Card>
          </Reveal>
          {on ? (
            <Reveal delay={staggerDelay(3)}>
              <Section title={t('profile.reminders.also')}>
                <Card className="gap-4 p-5">
                  <ToggleRow
                    label={t('profile.reminders.cards')}
                    value={settings.cards}
                    onChange={(cards) => change({ cards })}
                  />
                  <ToggleRow
                    label={t('profile.reminders.events')}
                    value={settings.events}
                    onChange={(events) => change({ events })}
                  />
                  <ToggleRow
                    label={t('profile.reminders.word')}
                    value={settings.word}
                    onChange={(word) => change({ word })}
                  />
                </Card>
              </Section>
              <Text variant="small" tone="muted" className="pt-3">
                {t('profile.reminders.push')}
              </Text>
            </Reveal>
          ) : null}
        </>
      )}
    </ProfilePage>
  );
}
