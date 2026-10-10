import { Text, type TextTone } from '@/components/text';
import { View } from 'react-native';

const LOOK = {
  /** A kind or a role ("Friend", "Teacher"). */
  primary: { box: 'bg-primary-soft', tone: 'primary' },
  /** A quiet remark on a card that sits on the page ("Measured"). */
  surface: { box: 'bg-surface', tone: 'muted' },
  /** The same on a raised surface ("AI"). */
  chip: { box: 'bg-chip', tone: 'muted' },
} as const satisfies Record<string, { box: string; tone: TextTone }>;

/** A tiny uppercase tag beside a name or a value. */
export function Badge({ label, tone = 'primary' }: { label: string; tone?: keyof typeof LOOK }) {
  const look = LOOK[tone];
  return (
    <View className={`rounded-sm px-1.5 py-1 ${look.box}`}>
      <Text variant="badge" tone={look.tone}>
        {label}
      </Text>
    </View>
  );
}
