import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '@/components/text';
import { ILLUSTRATION_MAX_FONT_SCALE } from '@/lib/layout';

/**
 * One chat turn. `persona` turns sit left on a card; `learner` turns sit right in the primary
 * color. The tail corner points at the speaker. Bubbles never exceed 80% of the row, so long
 * lines wrap instead of reaching the far edge.
 */
export function ChatBubble({
  from,
  children,
  gloss,
  decorative = false,
}: {
  from: 'persona' | 'learner';
  children: ReactNode;
  /** A translation shown under the line. */
  gloss?: string;
  /** Inside an illustration: caps text growth so the drawing keeps its shape. */
  decorative?: boolean;
}) {
  const persona = from === 'persona';
  const scale = decorative ? ILLUSTRATION_MAX_FONT_SCALE : undefined;
  return (
    <View
      className={`max-w-[80%] rounded-card px-3.5 py-3 ${
        persona
          ? 'self-start rounded-bl-sm border border-border bg-chip'
          : 'self-end rounded-br-sm bg-primary'
      }`}
    >
      <Text variant="chat" tone={persona ? 'fg' : 'onPrimary'} maxFontSizeMultiplier={scale}>
        {children}
      </Text>
      {gloss ? (
        <Text variant="caption" tone="subtle" className="mt-0.5" maxFontSizeMultiplier={scale}>
          {gloss}
        </Text>
      ) : null}
    </View>
  );
}
