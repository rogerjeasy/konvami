import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '@/components/text';
import type { DiffPart } from '@/lib/word-diff';
import { useTheme } from '@/theme';

/** A sentence as one run of text, its changed words drawn by `mark` and the rest as they are. */
function marked(
  parts: readonly DiffPart[],
  mark: (text: string, key: number) => ReactNode,
): ReactNode[] {
  return parts.flatMap((part, i) => [
    i > 0 ? ' ' : '',
    part.changed ? mark(part.text, i) : part.text,
  ]);
}

/**
 * One correction on the report, v4 look: a white card with the kind of mistake in an amber chip,
 * what the learner said in the serif of the language learned with the changed words underlined
 * in amber, and the better way in a lime box with the fix marked in forest. Amber and calm,
 * never a red mark (spec §14.3 "zero shame").
 */
export function PolishCard({
  topic,
  badge,
  saidLabel,
  said,
  betterLabel,
  better,
  explanation,
  note,
  action,
  accessibilityLabel,
}: {
  /** What kind of correction it is ("Dative"), in the amber chip. */
  topic?: string;
  /** A remark on the correction itself ("Not sure"). */
  badge?: string;
  saidLabel: string;
  said: readonly DiffPart[];
  betterLabel: string;
  better: readonly DiffPart[];
  explanation: string;
  /** A quiet line under the explanation (why a correction is only a hint). */
  note?: string;
  /** What to do with the correction, under the text. */
  action?: ReactNode;
  /** The card's text in one sentence, for a screen reader. */
  accessibilityLabel: string;
}) {
  const { color } = useTheme();
  return (
    <View className="gap-3 rounded-panel border border-border bg-chip p-4">
      {/* Read as one sentence; the actions after it stay controls of their own. */}
      <View accessible accessibilityLabel={accessibilityLabel} className="gap-3">
        {topic || badge ? (
          <View className="flex-row flex-wrap items-center justify-between gap-2">
            {topic ? (
              <View className="min-h-8 shrink justify-center rounded-pill bg-warn-soft px-3 py-1">
                <Text variant="labelSmall" tone="warn">
                  {topic}
                </Text>
              </View>
            ) : (
              <View />
            )}
            {badge ? (
              <Text variant="captionStrong" tone="subtle">
                {badge}
              </Text>
            ) : null}
          </View>
        ) : null}
        <View className="gap-0.5">
          <Text variant="overline" tone="subtle">
            {saidLabel}
          </Text>
          <Text variant="langLarge">
            {marked(said, (text, key) => (
              <Text
                key={key}
                variant="langLarge"
                tone="inherit"
                className="underline"
                style={{ textDecorationColor: color.warnMark }}
              >
                {text}
              </Text>
            ))}
          </Text>
        </View>
        <View className="gap-0.5 rounded-card bg-lime px-3.5 py-3">
          <Text variant="overline" tone="onLime">
            {betterLabel}
          </Text>
          <Text variant="langLarge" tone="onLime">
            {marked(better, (text, key) => (
              <Text key={key} variant="langLarge" tone="lime" className="rounded-sm bg-forest">
                {text}
              </Text>
            ))}
          </Text>
        </View>
        <Text variant="bodySmall" tone="muted">
          {explanation}
        </Text>
        {note ? (
          <Text variant="caption" tone="subtle">
            {note}
          </Text>
        ) : null}
      </View>
      {action}
    </View>
  );
}
