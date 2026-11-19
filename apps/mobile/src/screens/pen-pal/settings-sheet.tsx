import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { PenPalSettings, PenPalSettingsChange } from '@konvami/api-client';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ToggleRow } from '@/components/choice-group';
import { NoticeBox } from '@/components/notice-box';
import { Sheet } from '@/components/sheet';
import { Stepper } from '@/components/stepper';
import { Text } from '@/components/text';
import { formatTimeOfDay } from '@/lib/format';
import { commitFeedback } from '@/lib/haptics';

// How many notes a week a learner can ask their partners for.
const NOTES_PER_WEEK: readonly number[] = [1, 3, 5, 7];
// The hours between which no note is sent: from late evening, until the morning.
const QUIET_FROM_HOURS: readonly number[] = [20, 21, 22, 23];
const QUIET_TO_HOURS: readonly number[] = [6, 7, 8, 9, 10];

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
    <Sheet icon="mic" visible={visible} title={t('penPal.sheet.title')} onClose={onClose}>
      <View className="gap-4 pt-1">
        <ToggleRow
          label={t('penPal.sheet.on')}
          value={settings.enabled}
          onChange={(enabled) => void change({ enabled })}
        />
        {settings.enabled ? (
          <>
            <Card className="gap-4 p-4">
              <Stepper
                title={t('penPal.sheet.perWeek')}
                options={NOTES_PER_WEEK}
                value={settings.perWeek}
                onChange={(perWeek) => void change({ perWeek })}
                number={String}
                unit={(count) => t('penPal.sheet.noteUnit', { count })}
                label={(count) => `${count} ${t('penPal.sheet.noteUnit', { count })}`}
                lessLabel={t('common.less', { what: t('penPal.sheet.perWeek') })}
                moreLabel={t('common.more', { what: t('penPal.sheet.perWeek') })}
              />
            </Card>
            <Card className="gap-4 p-4">
              <View className="gap-1">
                <Text variant="heading" accessibilityRole="header">
                  {t('penPal.sheet.quiet')}
                </Text>
                <Text variant="small" tone="muted">
                  {t('penPal.sheet.quietHint')}
                </Text>
              </View>
              <View className="gap-5">
                <Stepper
                  title={t('penPal.sheet.quietFrom')}
                  options={QUIET_FROM_HOURS}
                  value={settings.quietFrom}
                  onChange={(quietFrom) => void change({ quietFrom })}
                  number={(value) => formatTimeOfDay(i18n.language, hour(value))}
                  label={(value) => formatTimeOfDay(i18n.language, hour(value))}
                  lessLabel={t('common.earlier', { what: t('penPal.sheet.quietFrom') })}
                  moreLabel={t('common.later', { what: t('penPal.sheet.quietFrom') })}
                />
                <Stepper
                  title={t('penPal.sheet.quietTo')}
                  options={QUIET_TO_HOURS}
                  value={settings.quietTo}
                  onChange={(quietTo) => void change({ quietTo })}
                  number={(value) => formatTimeOfDay(i18n.language, hour(value))}
                  label={(value) => formatTimeOfDay(i18n.language, hour(value))}
                  lessLabel={t('common.earlier', { what: t('penPal.sheet.quietTo') })}
                  moreLabel={t('common.later', { what: t('penPal.sheet.quietTo') })}
                />
              </View>
            </Card>
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
