import { createDraft } from '@/lib/draft';
import type { AgeBracket } from '@/lib/validation';

/**
 * What the user has entered so far while creating an account (2.1–2.4). The password is dropped
 * as soon as the user is signed in.
 */
export interface SignUpDraft {
  /** Set by the age check; null means it has not been passed. */
  ageBracket: AgeBracket | null;
  firstName: string;
  email: string;
  password: string;
  tipsOptIn: boolean;
}

const { Provider, useDraft } = createDraft<SignUpDraft>('Sign-up', {
  ageBracket: null,
  firstName: '',
  email: '',
  password: '',
  tipsOptIn: false,
});

export { Provider as SignUpDraftProvider, useDraft as useSignUpDraft };
