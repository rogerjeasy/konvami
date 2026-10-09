import { useMemo } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { space } from '@konvami/design-tokens';
import { WheelPicker, wheelRowHeight, WHEEL_VISIBLE_ROWS } from '@/components/wheel-picker';
import { useScreenLayout } from '@/hooks/use-screen-layout';
import { dateChoices, type CalendarDate, type DatePart } from '@/lib/dates';
import { monthNames } from '@/lib/format';

// From this OS text scale, month names are shortened so they fit their column.
const SHORT_MONTHS_FROM_SCALE = 1.3;
// Padding inside the wheel panel (pt), as on the design (2.1 Age check).
const WHEEL_PAD = { x: 10, y: 5 } as const;

const PARTS: readonly DatePart[] = ['day', 'month', 'year'];

/** The month names the wheels and any summary beside them show: short when space is tight. */
export function useWheelMonths(): string[] {
  const { i18n } = useTranslation();
  const { fontScale } = useWindowDimensions();
  const { compact } = useScreenLayout();
  return useMemo(
    () =>
      monthNames(i18n.language, compact || fontScale >= SHORT_MONTHS_FROM_SCALE ? 'short' : 'long'),
    [i18n.language, compact, fontScale],
  );
}

/**
 * Day, month and year wheels on one panel, with a band marking the chosen row. The parent owns
 * the date and decides what a change does to it (see `withDatePart`); the wheels only offer what
 * is allowed: real days of the month, and nothing before `min`.
 */
export function DateWheels({
  value,
  years,
  min,
  onChange,
}: {
  value: CalendarDate;
  /** The first and last year offered. */
  years: { from: number; to: number };
  /** The earliest date that can be chosen. */
  min?: CalendarDate;
  onChange: (part: DatePart, value: number) => void;
}) {
  const { t } = useTranslation();
  const { fontScale } = useWindowDimensions();
  const months = useWheelMonths();
  const row = wheelRowHeight(fontScale);

  const items = useMemo(() => {
    const choices = dateChoices(value, { years, min });
    return {
      day: choices.days.map((day) => ({ value: day, label: String(day) })),
      month: choices.months.map((month) => ({ value: month, label: months[month - 1] ?? '' })),
      year: choices.years.map((year) => ({ value: year, label: String(year) })),
    };
    // `years` and `min` are compared by their numbers, so a new object each render is fine.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.year, value.month, years.from, years.to, min?.year, min?.month, min?.day, months]);

  return (
    <View
      className="overflow-hidden rounded-card bg-surface"
      style={{ paddingHorizontal: WHEEL_PAD.x, paddingVertical: WHEEL_PAD.y }}
    >
      {/* The band marking the selected row: a drawing behind the wheels, sized by its box. */}
      <View
        aria-hidden
        className="absolute rounded-md border border-border bg-bg"
        style={{
          pointerEvents: 'none',
          left: WHEEL_PAD.x,
          right: WHEEL_PAD.x,
          top: WHEEL_PAD.y + (row * (WHEEL_VISIBLE_ROWS - 1)) / 2,
          height: row,
        }}
      />
      <View className="flex-row" style={{ gap: space.xs }}>
        {PARTS.map((part) => (
          <View key={part} className="flex-1">
            <WheelPicker
              label={t(`common.${part}`)}
              items={items[part]}
              value={value[part]}
              onChange={(next) => onChange(part, next)}
            />
          </View>
        ))}
      </View>
    </View>
  );
}
