import type { ApiClient, ProfileQuestionState } from '@konvami/api-client';
import {
  createResourceStore,
  type ResourceState,
  type ResourceStore,
} from '@/practice/resource-store';

/**
 * The question about a setting that is due now (progressive profiling, spec §6.1.2), as the card
 * on Today shows it. Answering or dismissing sends the answer to the server first; the card goes
 * only when the server took it.
 */
export type QuestionStateOf = ResourceState<ProfileQuestionState>;

export interface QuestionStore extends ResourceStore<ProfileQuestionState> {
  /** Applies an answer to the setting. Rejects with an `ApiError`; the card stays. */
  answer(id: string, option: string): Promise<void>;
  /** The learner does not want to answer now. Rejects with an `ApiError`; the card stays. */
  dismiss(id: string): Promise<void>;
}

export function createQuestionStore(
  api: Pick<ApiClient, 'getProfileQuestion' | 'answerProfileQuestion' | 'dismissProfileQuestion'>,
  /** Milliseconds since the epoch. */
  now: () => number,
  /** Called after an answer, which may have changed a setting that is shown elsewhere. */
  onAnswered: () => void,
): QuestionStore {
  const store = createResourceStore(() => api.getProfileQuestion(), now);
  return {
    ...store,
    async answer(id, option) {
      await store.mutate(
        () => api.answerProfileQuestion(id, option),
        (_, next) => next,
      );
      onAnswered();
    },
    async dismiss(id) {
      await store.mutate(
        () => api.dismissProfileQuestion(id),
        (_, next) => next,
      );
    },
  };
}
