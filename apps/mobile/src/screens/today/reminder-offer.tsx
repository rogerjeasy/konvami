import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { formatTimeOfDay } from '@/lib/format';
import { commitFeedback } from '@/lib/haptics';
import { setReminders, usePreferences } from '@/preferences';
import { DEFAULT_REMINDERS } from '@/reminders/schedule';
import { useReminderPermission } from '@/reminders/services';
import { useTheme } from '@/theme';

/**
 * Offers practice reminders once, when they are first useful: after the first conversation,
 * on a phone that can show them. The system asks for its permission only when the learner says
 * yes; either answer is kept, and the Profile can change it later (spec §6.1.2: ask at the right
 * moment).
 */
export function ReminderOffer({ partnerName }: { partnerName: string }) {
  const { t, i18n } = useTranslation();
  const { color } = useTheme();
  const { reminders } = usePreferences();
  const { permission, ask } = useReminderPermission();
  const [asking, setAsking] = useState(false);
  if (reminders !== null || permission === null) return null;
  if (permission === 'unsupported' || permission === 'denied') return null;

  async function remind() {
    commitFeedback();
    setAsking(true);
    const answer = permission === 'granted' ? permission : await ask(t('reminders.channel'));
    setAsking(false);
    await setReminders({ ...DEFAULT_REMINDERS, on: answer === 'granted' });
  }

  return (
    <Card className="gap-3 p-4">
      <View className="flex-row items-start gap-3">
        <View className="pt-0.5" aria-hidden>
          <Icon name="clock" color={color.primaryText} size={size.iconMd} />
        </View>
        <View className="flex-1 gap-1">
          <Text variant="label" accessibilityRole="header">
            {t('today.reminders.title')}
          </Text>
          <Text variant="small" tone="muted">
            {t('today.reminders.body', {
              name: partnerName,
              time: formatTimeOfDay(i18n.language, DEFAULT_REMINDERS.time),
            })}
          </Text>
        </View>
      </View>
      <View className="gap-1">
        <Button
          variant="secondary"
          label={t('today.reminders.yes')}
          loading={asking}
          onPress={remind}
        />
        <TextButton
          tone="primary"
          label={t('today.reminders.no')}
          onPress={() => void setReminders({ ...DEFAULT_REMINDERS, on: false })}
        />
      </View>
    </Card>
  );
}
