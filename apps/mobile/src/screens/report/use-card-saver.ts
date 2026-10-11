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
  /** How many confirmed corrections and words of the report are not cards yet. */
  unsaved: { corrections: number; words: number };
  /**
   * Saves everything that is not a card yet, one after the other, in the order of the page:
   * the confirmed corrections, then the words.
   */
  saveAll(): Promise<void>;
  savingAll: boolean;
  /** Why the last save of one item of that kind failed (`too_many`, …); null when it did not. */
  failure(kind: CardKind): string | null;
  /** Why `saveAll` stopped before the end; null when it did not. */
  failureOfAll: string | null;
}

export function useCardSaver(conversationId: string, report: SessionReport): CardSaver {
  const { saveCard } = usePracticeServices();
  const [saved, setSaved] = useState<ReadonlySet<string>>(new Set());
  const [saving, setSaving] = useState<ReadonlySet<string>>(new Set());
  const [savingAll, setSavingAll] = useState(false);
  /** `all`: it happened while saving everything, and is said where that was asked for. */
  const [failed, setFailed] = useState<{ kind: CardKind; code: string; all: boolean } | null>(null);

  const isSaved = (kind: CardKind, index: number) =>
    saved.has(keyOf(kind, index)) ||
    Boolean((kind === 'word' ? report.words[index] : report.mistakes[index])?.saved);

  // Only what the second check confirmed can become a card (the server refuses the rest).
  const open: { kind: CardKind; index: number }[] = [
    ...report.mistakes.flatMap(({ certain }, index) =>
      certain && !isSaved('correction', index) ? [{ kind: 'correction' as const, index }] : [],
    ),
    ...report.words.flatMap((_, index) =>
      isSaved('word', index) ? [] : [{ kind: 'word' as const, index }],
    ),
  ];

  /** Saves one; says whether it worked. */
  async function saveOne(kind: CardKind, index: number, all = false): Promise<boolean> {
    const key = keyOf(kind, index);
    setFailed(null);
    setSaving((now) => new Set(now).add(key));
    try {
      await saveCard({ conversationId, kind, index });
      setSaved((now) => new Set(now).add(key));
      return true;
    } catch (error) {
      setFailed({ kind, code: apiErrorCode(error), all });
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

    unsaved: {
      corrections: open.filter(({ kind }) => kind === 'correction').length,
      words: open.filter(({ kind }) => kind === 'word').length,
    },

    async saveAll() {
      setSavingAll(true);
      let any = false;
      for (const { kind, index } of open) {
        // A deck that is full stays full: the rest would fail the same way.
        if (!(await saveOne(kind, index, true))) break;
        any = true;
      }
      setSavingAll(false);
      // One haptic for the whole lot, not one per card.
      if (any) successFeedback();
    },
    savingAll,

    failure: (kind) => (failed && !failed.all && failed.kind === kind ? failed.code : null),
    failureOfAll: failed?.all ? failed.code : null,
  };
}
