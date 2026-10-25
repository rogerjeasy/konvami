import { View } from 'react-native';
import { size } from '@konvami/design-tokens';
import { Card } from '@/components/card';
import { Icon, type IconName } from '@/components/icon';
import { PressScale } from '@/components/motion';
import { Text } from '@/components/text';
import { useTheme } from '@/theme';

/**
 * One thing the app was told, read back: what it is about, the answer in words, where it came
 * from, and (when given) when it last changed. The whole card is the button that changes it.
 */
export function AnswerCard({
  icon,
  title,
  value,
  details = [],
  source,
  note,
  editLabel,
  onPress,
}: {
  icon: IconName;
  /** The question's short name ("Goals"). */
  title: string;
  value: string;
  /** Further lines under the value. */
  details?: readonly string[];
  /** Where the value came from ("You told me", "Measured"); left out for one not set yet. */
  source?: string;
  /** A quiet line at the end ("Changed October 9, 2026"). */
  note?: string;
  /** What the button does, for screen readers ("Edit: Goals"). */
  editLabel: string;
  onPress: () => void;
}) {
  const { color } = useTheme();
  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={editLabel}
      accessibilityHint={[value, ...details].join('. ')}
      onPress={onPress}
    >
      <Card className="flex-row items-start gap-3 p-3.5">
        <View
          aria-hidden
          style={{ width: size.avatarSm, height: size.avatarSm }}
          className="items-center justify-center rounded-md bg-primary-soft"
        >
          <Icon name={icon} color={color.primaryText} size={size.iconMd} />
        </View>
        <View className="flex-1 gap-1">
          <Text variant="overline" tone="subtle">
            {title}
          </Text>
          <Text variant="label">{value}</Text>
          {details.map((line) => (
            <Text key={line} variant="small" tone="muted">
              {line}
            </Text>
          ))}
          {source || note ? (
            <View className="mt-1 flex-row flex-wrap items-center gap-x-2 gap-y-1">
              {source ? (
                <View className="rounded-sm bg-surface px-1.5 py-1">
                  <Text variant="badge" tone="muted">
                    {source}
                  </Text>
                </View>
              ) : null}
              {note ? (
                <Text variant="caption" tone="subtle">
                  {note}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
        <Icon name="edit" color={color.fgSubtle} size={size.icon} />
      </Card>
    </PressScale>
  );
}
