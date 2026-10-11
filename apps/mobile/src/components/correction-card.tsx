import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Badge } from '@/components/badge';
import { Card } from '@/components/card';
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
 * A sentence the learner said and how it is better said, with the words that differ standing
 * out in both: underlined in amber where they were, highlighted where they are right. The same
 * look as the correction on the introduction's second slide. Amber and calm, never a red mark
 * (spec §14.3 "zero shame").
 */
export function CorrectionCard({
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
  /** What kind of correction it is ("Dative"), in the corner. */
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
  /** Something to do with the correction (save it as a card), under the text. */
  action?: ReactNode;
  /** The card's text in one sentence, for a screen reader. */
  accessibilityLabel: string;
}) {
  const { color } = useTheme();
  return (
    <Card className="gap-3 p-4">
      {/* Read as one sentence; the action after it stays a control of its own. */}
      <View accessible accessibilityLabel={accessibilityLabel} className="gap-3">
        {topic || badge ? (
          <View className="flex-row flex-wrap items-center justify-between gap-2">
            <Text variant="caption" tone="subtle" className="shrink">
              {topic}
            </Text>
            {badge ? <Badge label={badge} tone="surface" /> : null}
          </View>
        ) : null}
        <View className="gap-1">
          <Text variant="caption" tone="subtle">
            {saidLabel}
          </Text>
          <Text variant="callout" tone="muted">
            {marked(said, (text, key) => (
              <Text
                key={key}
                variant="callout"
                tone="inherit"
                className="underline"
                style={{ textDecorationColor: color.warnMark }}
              >
                {text}
              </Text>
            ))}
          </Text>
        </View>
        <View className="gap-1">
          <Text variant="caption" tone="subtle">
            {betterLabel}
          </Text>
          <Text variant="emphasis">
            {marked(better, (text, key) => (
              <Text
                key={key}
                variant="emphasis"
                tone="primary"
                className="rounded-sm bg-primary-soft"
              >
                {text}
              </Text>
            ))}
          </Text>
        </View>
        <Text variant="small" tone="muted">
          {explanation}
        </Text>
        {note ? (
          <Text variant="caption" tone="subtle">
            {note}
          </Text>
        ) : null}
      </View>
      {action}
    </Card>
  );
}
