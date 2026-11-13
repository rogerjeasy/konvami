import { createDraft } from '@/lib/draft';

/**
 * What the learner noted while preparing an exam simulation (5.17), still there during the test,
 * as notes are in the real exam. In memory only, and forgotten when the test ends.
 */
export interface ExamNotes {
  notes: string;
  /** One preparation screen authorizes one exam, in memory only. */
  assessmentExam: string | null;
}

const { Provider, useDraft } = createDraft<ExamNotes>('Exam notes', {
  notes: '',
  assessmentExam: null,
});

export { Provider as ExamNotesProvider, useDraft as useExamNotes };
