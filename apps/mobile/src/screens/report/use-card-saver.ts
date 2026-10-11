import { useState } from 'react';
import type { CardKind, SessionReport } from '@konvami/api-client';
import { apiErrorCode } from '@/api/messages';
import { successFeedback } from '@/lib/haptics';
import { usePracticeServices } from '@/practice/services';

const keyOf = (kind: CardKind, index: number) => `${kind}:${index}`;

/** Saving words and corrections of one report as flashcards, and knowing which already are. */
export interface CardSaver {
  /** The learner has it as a card: it was one when the report was read, or was saved since. */
  isSaved(kind: CardKind, index: number): boolean;
  isSaving(kind: CardKind, index: number): boolean;
  save(kind: CardKind, index: number): Promise<void>;
  /** Saves every word that is not a card yet, one after the other. */
  saveWords(): Promise<void>;
  /** Why the last save of that kind failed (`too_many`, `network`, …); null when it did not. */
  failure(kind: CardKind): string | null;
}

export function useCardSaver(conversationId: string, report: SessionReport): CardSaver {
  const { saveCard } = usePracticeServices();
  const [saved, setSaved] = useState<ReadonlySet<string>>(new Set());
  const [saving, setSaving] = useState<ReadonlySet<string>>(new Set());
  const [failed, setFailed] = useState<{ kind: CardKind; code: string } | null>(null);

  const isSaved = (kind: CardKind, index: number) =>
    saved.has(keyOf(kind, index)) ||
    Boolean((kind === 'word' ? report.words[index] : report.mistakes[index])?.saved);

  /** Saves one; says whether it worked. */
  async function saveOne(kind: CardKind, index: number): Promise<boolean> {
    const key = keyOf(kind, index);
    setFailed(null);
    setSaving((now) => new Set(now).add(key));
    try {
      await saveCard({ conversationId, kind, index });
      setSaved((now) => new Set(now).add(key));
      return true;
    } catch (error) {
      setFailed({ kind, code: apiErrorCode(error) });
      return false;
    } finally {
      setSaving((now) => new Set([...now].filter((other) => other !== key)));
    }
  }

  return {
    isSaved,
    isSaving: (kind, index) => saving.has(keyOf(kind, index)),

    async save(kind, index) {
      // One haptic for the moment the card exists, with the tick that shows it.
      if (await saveOne(kind, index)) successFeedback();
    },

    async saveWords() {
      let any = false;
      for (const index of report.words.keys()) {
        if (isSaved('word', index)) continue;
        // A deck that is full stays full: the rest would fail the same way.
        if (!(await saveOne('word', index))) break;
        any = true;
      }
      if (any) successFeedback();
    },

    failure: (kind) => (failed?.kind === kind ? failed.code : null),
  };
}
