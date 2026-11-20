import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Badge } from '@/components/badge';
import { Button, type ButtonVariant } from '@/components/button';
import { Card } from '@/components/card';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';

/** One thing the owner decides on, as the queue shows it. */
export interface QueueEntry {
  key: string;
  /** What it is: "Move held", "Reported by Linde-7". */
  label: string;
  /** A chip beside the label (an AI's words). */
  badge?: string;
  /** The words held or reported. */
  transcript: string;
  /** Quiet lines under the words: the reasons, who said it. */
  details: readonly string[];
  /** The decisions, two to a row. */
  actions: readonly QueueAction[];
  /** A decision of lesser weight under the others (taking a whole show off air). */
  extra?: QueueAction;
}

export interface QueueAction {
  label: string;
  variant: ButtonVariant;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}

/** Pairs of decisions, so two buttons share a row on every phone. */
function pairs(actions: readonly QueueAction[]): QueueAction[][] {
  const rows: QueueAction[][] = [];
  for (let i = 0; i < actions.length; i += 2) rows.push(actions.slice(i, i + 2));
  return rows;
}

/**
 * A game's held and reported voice messages on the owner's page (6.15): Two Halves (7.x), Radio
 * Konvami (8.8) and the story chain (9.11) look and work the same. Presentational: each game's
 * screen loads its items and makes the decisions.
 */
export function ModerationQueue({
  title,
  empty,
  header,
  entries,
}: {
  title: string;
  empty: string;
  /** Above the items (the owner's numbers). */
  header?: ReactNode;
  entries: readonly QueueEntry[];
}) {
  return (
    <View className="gap-2.5">
      <Text variant="section" accessibilityRole="header">
        {title}
      </Text>
      {header}
      {entries.length === 0 ? (
        <Text tone="muted">{empty}</Text>
      ) : (
        entries.map((entry) => (
          <Card key={entry.key} className="gap-2 p-4">
            <View className="flex-row flex-wrap items-center gap-2">
              <Text variant="labelSmall" tone="muted">
                {entry.label}
              </Text>
              {entry.badge ? <Badge label={entry.badge} tone="chip" /> : null}
            </View>
            <Text>{entry.transcript}</Text>
            {entry.details.map((detail) => (
              <Text key={detail} variant="small" tone="muted">
                {detail}
              </Text>
            ))}
            {pairs(entry.actions).map((row) => (
              <View key={row.map((one) => one.label).join()} className="flex-row gap-2.5">
                {row.map((action) => (
                  <View key={action.label} className="flex-1">
                    <Button
                      variant={action.variant}
                      label={action.label}
                      disabled={action.disabled}
                      loading={action.loading}
                      onPress={action.onPress}
                    />
                  </View>
                ))}
              </View>
            ))}
            {entry.extra ? (
              <TextButton
                label={entry.extra.label}
                disabled={entry.extra.disabled}
                onPress={entry.extra.onPress}
              />
            ) : null}
          </Card>
        ))
      )}
    </View>
  );
}
