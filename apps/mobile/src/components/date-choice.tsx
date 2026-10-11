import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import { Button } from '@/components/button';
import { DateWheels } from '@/components/date-wheels';
import { Icon } from '@/components/icon';
import { Sheet } from '@/components/sheet';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { fromIsoDate, toIsoDate, withDatePart, type CalendarDate } from '@/lib/dates';
import { formatDate } from '@/lib/format';
import { stepFeedback } from '@/lib/haptics';
import { useTheme } from '@/theme';

/**
 * A calendar date that may be there or not (an exam's date, the day of something remembered).
 * Without one, a button offers to add it; with one, it is written out, with the ways to change
 * and to remove it. The date is picked on wheels, in a sheet.
 */
export function DateChoice({
  value,
  onChange,
  opensOn,
  years,
  min,
  labels,
}: {
  /** The date as the API stores it ("2027-06-15"); null when there is none. */
  value: string | null;
  onChange: (date: string | null) => void;
  /** Where the wheels open when there is no date yet. */
  opensOn: CalendarDate;
  /** The first and last year the wheels offer. */
  years: { from: number; to: number };
  /** The earliest date that can be chosen. */
  min?: CalendarDate;
  /** `title` heads the sheet; `confirm` is its button. */
  labels: { add: string; change: string; remove: string; title: string; confirm: string };
}) {
  const { i18n } = useTranslation();
  const { color } = useTheme();
  /** The date on the wheels while the sheet is open; null when it is closed. */
  const [picking, setPicking] = useState<CalendarDate | null>(null);
  return (
    <>
      {value ? (
        <View className="gap-1">
          <View className="min-h-field flex-row items-center gap-3 rounded-field border border-field-border bg-bg px-4 py-3">
            <Icon name="calendar" color={color.primaryText} size={size.iconMd} />
            <Text variant="label" className="flex-1">
              {formatDate(i18n.language, value)}
            </Text>
          </View>
          <View className="flex-row flex-wrap">
            <TextButton
              tone="primary"
              label={labels.change}
              onPress={() => setPicking(fromIsoDate(value) ?? opensOn)}
            />
            <TextButton label={labels.remove} onPress={() => onChange(null)} />
          </View>
        </View>
      ) : (
        <Button
          variant="secondary"
          label={labels.add}
          leading={<Icon name="calendar" color={color.fg} size={size.iconMd} />}
          onPress={() => setPicking(opensOn)}
        />
      )}
      <Sheet visible={picking !== null} title={labels.title} onClose={() => setPicking(null)}>
        {picking ? (
          <View className="gap-4 pt-1">
            <DateWheels
              value={picking}
              min={min}
              years={years}
              onChange={(part, to) =>
                setPicking((current) => current && withDatePart(current, part, to, min))
              }
            />
            <Button
              label={labels.confirm}
              onPress={() => {
                stepFeedback();
                onChange(toIsoDate(picking));
                setPicking(null);
              }}
            />
          </View>
        ) : null}
      </Sheet>
    </>
  );
}
