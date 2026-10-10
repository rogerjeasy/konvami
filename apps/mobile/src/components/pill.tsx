import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '@/components/text';
import { ILLUSTRATION_MAX_FONT_SCALE } from '@/lib/layout';

const LOOK = {
  /** Something worth noticing that is neither good nor bad news (a streak). */
  primary: { box: 'bg-primary-soft', tone: 'primary' },
  success: { box: 'bg-success-soft', tone: 'success' },
  warn: { box: 'bg-warn-soft', tone: 'warn' },
  danger: { box: 'bg-danger-soft', tone: 'danger' },
} as const;

/** Small status chip ("Listening", "Let's polish this"). Never red-alarm for learner mistakes: use `warn`. */
export function Pill({
  label,
  tone,
  leading,
  decorative = false,
}: {
  label: string;
  tone: keyof typeof LOOK;
  leading?: ReactNode;
  /** Inside an illustration: caps text growth so the drawing keeps its shape. */
  decorative?: boolean;
}) {
  const look = LOOK[tone];
  return (
    <View
      className={`flex-row items-center self-start gap-1.5 rounded-pill px-2.5 py-1 ${look.box}`}
    >
      {leading}
      <Text
        variant="captionStrong"
        tone={look.tone}
        maxFontSizeMultiplier={decorative ? ILLUSTRATION_MAX_FONT_SCALE : undefined}
      >
        {label}
      </Text>
    </View>
  );
}
