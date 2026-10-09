import { View } from 'react-native';
import { size } from '@konvami/design-tokens';
import { Text } from '@/components/text';
import { ILLUSTRATION_MAX_FONT_SCALE } from '@/lib/layout';

const TONE = {
  /** A practice persona. */
  persona: { disc: 'bg-brand-avatar', initial: 'text-brand-on-avatar' },
  /** The setup guide, who is not a practice persona. */
  guide: { disc: 'bg-brand-guide', initial: 'text-brand-on-guide' },
} as const;

/** Placeholder persona portrait (initial on the brand tile) until animated avatars exist (spec §6.20). */
export function PersonaAvatar({
  name,
  diameter = size.avatarSm,
  tone = 'persona',
}: {
  name: string;
  diameter?: number;
  tone?: keyof typeof TONE;
}) {
  return (
    <View
      style={{ width: diameter, height: diameter, borderRadius: diameter / 2 }}
      className={`items-center justify-center ${TONE[tone].disc}`}
    >
      <Text
        variant="heading"
        tone="inherit"
        className={TONE[tone].initial}
        maxFontSizeMultiplier={ILLUSTRATION_MAX_FONT_SCALE}
      >
        {name.charAt(0)}
      </Text>
    </View>
  );
}
