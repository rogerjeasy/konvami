import { useEffect, useState } from 'react';
import type { FlagKind, FlagReason } from '@konvami/api-client';
import { usePracticeServices } from '@/practice/services';

const keyOf = (kind: FlagKind, index: number) => `${kind}:${index}`;

/** What the learner reported in one conversation (spec §16.1), and the way to report more. */
export interface Flags {
  /** The learner reported this line or correction: earlier, or since this screen opened. */
  has(kind: FlagKind, index: number): boolean;
  /** Reports one. Rejects with an `ApiError` (`flag_limit`, `network`, …); then nothing changed. */
  submit(kind: FlagKind, index: number, reason: FlagReason, note: string): Promise<void>;
}

/** Read once when the screen opens, then kept up to date by what the learner reports. */
export function useFlags(conversationId: string): Flags {
  const { readFlags, flagItem } = usePracticeServices();
  const [flagged, setFlagged] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    let current = true;
    readFlags(conversationId).then(
      ({ flags }) =>
        current &&
        setFlagged(
          (known) => new Set([...known, ...flags.map(({ kind, index }) => keyOf(kind, index))]),
        ),
      // Without them the screen only lacks the "Reported" marks.
      () => {},
    );
    return () => {
      current = false;
    };
  }, [readFlags, conversationId]);

  return {
    has: (kind, index) => flagged.has(keyOf(kind, index)),
    async submit(kind, index, reason, note) {
      await flagItem(conversationId, { kind, index, reason, note: note.trim() || null });
      setFlagged((known) => new Set(known).add(keyOf(kind, index)));
    },
  };
}
