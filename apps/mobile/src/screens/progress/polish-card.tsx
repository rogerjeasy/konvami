import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import type { MistakeKind, Progress } from '@konvami/api-client';
import { Card } from '@/components/card';
import { Icon } from '@/components/icon';
import { Pill } from '@/components/pill';
import { Text } from '@/components/text';
import { formatDayOfYear } from '@/lib/format';
import { useTheme } from '@/theme';

// How strongly a week's cell is filled, by how often the mistake came up in it: once, a few
// times, often. A week without it is an empty cell.
const ONCE = 0.4;
const A_FEW = 0.7;
const OFTEN = 1;
const A_FEW_FROM = 2;
const OFTEN_FROM = 4;

function strength(count: number): number {
  if (count >= OFTEN_FROM) return OFTEN;
  return count >= A_FEW_FROM ? A_FEW : ONCE;
}

/** One kind of mistake: its name, how often it came up, and a cell per week. */
function KindRow({ kind, weeks }: { kind: MistakeKind; weeks: number }) {
  const { t } = useTranslation();
  const { color } = useTheme();
  const total = kind.counts.reduce((sum, count) => sum + count, 0);
  // The server names the kind; one this app version has no name for is "Other".
  const name = t(`report.category.${kind.category}` as 'report.category.other', {
    defaultValue: t('report.category.other'),
  });
  return (
    <View
      accessible
      accessibilityLabel={t('progress.polish.rowLabel', { kind: name, count: total, weeks })}
      className="gap-1.5"
    >
      <View className="flex-row items-baseline justify-between gap-3">
        <Text variant="labelSmall" className="flex-1">
          {name}
        </Text>
        <Text variant="captionStrong" tone="warn">
          {total}
        </Text>
      </View>
      <View className="flex-row gap-1">
        {kind.counts.map((count, i) => (
          <View
            key={i}
            style={{ height: size.heatCell }}
            className="flex-1 overflow-hidden rounded-sm bg-track"
          >
            {count > 0 ? (
              <View
                style={{ flex: 1, backgroundColor: color.warnMark, opacity: strength(count) }}
              />
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * The kinds of mistake the learner's reports confirmed, week by week: amber where one came up,
 * stronger the more often, never red (spec §14.3 "zero shame"). Without a mistake in the weeks
 * shown, it says so.
 */
export function PolishCard({ mistakes }: { mistakes: Progress['mistakes'] }) {
  const { t, i18n } = useTranslation();
  const { color } = useTheme();
  const weeks = mistakes.weeks.length;
  const first = mistakes.weeks[0];
  return (
    <Card className="gap-4 p-4">
      <View className="gap-2">
        <Pill
          tone="warn"
          label={t('progress.polish.title')}
          leading={<Icon name="edit" color={color.warnText} size={size.iconSm} />}
        />
        <Text variant="small" tone="subtle">
          {mistakes.kinds.length ? t('progress.polish.body') : t('progress.polish.none', { weeks })}
        </Text>
      </View>
      {mistakes.kinds.length ? (
        <>
          <View className="gap-3.5">
            {mistakes.kinds.map((kind) => (
              <KindRow key={kind.category} kind={kind} weeks={weeks} />
            ))}
          </View>
          <View className="flex-row justify-between gap-3">
            <Text variant="caption" tone="subtle">
              {first ? t('progress.since', { date: formatDayOfYear(i18n.language, first) }) : ''}
            </Text>
            <Text variant="caption" tone="subtle">
              {t('progress.thisWeek')}
            </Text>
          </View>
        </>
      ) : null}
    </Card>
  );
}
