import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { PenPalSettings, PenPalSettingsChange } from '@konvami/api-client';
import { Button } from '@/components/button';
import { ChoiceChip } from '@/components/choice-chip';
import { ChoiceGroup, ToggleRow } from '@/components/choice-group';
import { NoticeBox } from '@/components/notice-box';
import { Sheet } from '@/components/sheet';
import { Text } from '@/components/text';
import { formatTimeOfDay } from '@/lib/format';
import { commitFeedback } from '@/lib/haptics';

// How many notes a week a learner can ask their partners for.
const NOTES_PER_WEEK = [1, 3, 5, 7] as const;
// The hours between which no note is sent: from late evening, until the morning.
const QUIET_FROM_HOURS = [20, 21, 22, 23] as const;
const QUIET_TO_HOURS = [6, 7, 8, 9, 10] as const;

const hour = (value: number) => `${String(value).padStart(2, '0')}:00`;

/**
 * Pen-pal settings (spec §6.16): whether partners write on their own, how many notes a week and
 * the quiet hours with none. A change is kept at once; the device's time zone goes with it, so
 * the quiet hours are on the learner's own clock.
 */
export function PenPalSettingsSheet({
  visible,
  settings,
  timeZone,
  onChange,
  onClose,
}: {
  visible: boolean;
  settings: PenPalSettings;
  /** The device's time zone, when it can say. */
  timeZone: string | undefined;
  onChange: (changes: PenPalSettingsChange) => Promise<unknown>;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [failed, setFailed] = useState(false);

  async function change(changes: PenPalSettingsChange) {
    commitFeedback();
    setFailed(false);
    try {
      await onChange(timeZone ? { ...changes, timezone: timeZone } : changes);
    } catch {
      setFailed(true);
    }
  }

  return (
    <Sheet visible={visible} title={t('penPal.sheet.title')} onClose={onClose}>
      <View className="gap-4 pt-1">
        <ToggleRow
          label={t('penPal.sheet.on')}
          value={settings.enabled}
          onChange={(enabled) => void change({ enabled })}
        />
        {settings.enabled ? (
          <>
            <ChoiceGroup label={t('penPal.sheet.perWeek')} chips>
              {NOTES_PER_WEEK.map((count) => (
                <ChoiceChip
                  key={count}
                  label={String(count)}
                  selected={settings.perWeek === count}
                  onPress={() => void change({ perWeek: count })}
                />
              ))}
            </ChoiceGroup>
            <ChoiceGroup label={t('penPal.sheet.quietFrom')} chips>
              {QUIET_FROM_HOURS.map((value) => (
                <ChoiceChip
                  key={value}
                  label={formatTimeOfDay(i18n.language, hour(value))}
                  selected={settings.quietFrom === value}
                  onPress={() => void change({ quietFrom: value })}
                />
              ))}
            </ChoiceGroup>
            <ChoiceGroup label={t('penPal.sheet.quietTo')} chips>
              {QUIET_TO_HOURS.map((value) => (
                <ChoiceChip
                  key={value}
                  label={formatTimeOfDay(i18n.language, hour(value))}
                  selected={settings.quietTo === value}
                  onPress={() => void change({ quietTo: value })}
                />
              ))}
            </ChoiceGroup>
          </>
        ) : null}
        <Text variant="small" tone="muted">
          {t('penPal.sheet.note')}
        </Text>
        {failed ? (
          <View accessibilityLiveRegion="polite">
            <NoticeBox icon="alert" tone="danger">
              {t('errors.unknown')}
            </NoticeBox>
          </View>
        ) : null}
        <Button label={t('penPal.sheet.done')} onPress={onClose} />
      </View>
    </Sheet>
  );
}
