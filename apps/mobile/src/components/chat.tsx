import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '@/components/text';
import { ILLUSTRATION_MAX_FONT_SCALE } from '@/lib/layout';

/**
 * How a bubble's words are set: the language learned in the serif italic (`lang`), the learner's
 * words dark on lime (v4, as in the call), the partner's in the usual ink.
 */
export function chatText(from: 'persona' | 'learner', lang = false) {
  return {
    variant: lang ? ('langBody' as const) : ('chat' as const),
    tone: from === 'persona' ? ('fg' as const) : ('onLime' as const),
  };
}

/**
 * One chat turn. `persona` turns sit left on a card; `learner` turns sit right on lime. The tail corner points at the speaker. Bubbles never exceed 80% of the row, so long
 * lines wrap instead of reaching the far edge.
 */
export function ChatBubble({
  from,
  children,
  content,
  gloss,
  decorative = false,
  lang = false,
  accessibilityLabel,
}: {
  from: 'persona' | 'learner';
  children: ReactNode;
  content?: ReactNode;
  /** A translation shown under the line. */
  gloss?: string;
  /** Inside an illustration: caps text growth so the drawing keeps its shape. */
  decorative?: boolean;
  /** The words are in the language learned (set in the serif italic). */
  lang?: boolean;
  /** Makes the bubble one element for a screen reader, heard as this (who said what). */
  accessibilityLabel?: string;
}) {
  const persona = from === 'persona';
  const scale = decorative ? ILLUSTRATION_MAX_FONT_SCALE : undefined;
  return (
    <View
      accessible={accessibilityLabel !== undefined}
      accessibilityLabel={accessibilityLabel}
      className={`max-w-[80%] rounded-card px-3.5 py-3 ${
        persona
          ? 'self-start rounded-bl-sm border border-border bg-chip'
          : 'self-end rounded-br-sm bg-lime'
      }`}
    >
      {content ?? (
        <Text {...chatText(from, lang)} maxFontSizeMultiplier={scale}>
          {children}
        </Text>
      )}
      {gloss ? (
        <Text
          variant="caption"
          tone={persona ? 'subtle' : 'onLime'}
          className="mt-0.5"
          maxFontSizeMultiplier={scale}
        >
          {gloss}
        </Text>
      ) : null}
    </View>
  );
}
