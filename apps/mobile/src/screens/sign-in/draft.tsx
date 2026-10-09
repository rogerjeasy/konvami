import { createDraft } from '@/lib/draft';

/**
 * What the user has entered while signing in or resetting a password (3.1, 3.5–3.8). The email
 * follows the user between these screens, so it is typed once.
 */
export interface AccessDraft {
  email: string;
  /** The reset code from the email, entered on "Check your email". */
  code: string;
  /** Set when the service refused the code, so "Check your email" can say so. */
  codeRefused: boolean;
  /** Whether the finished reset also signed the account out on other devices (for 3.8). */
  signedOutOthers: boolean;
}

const { Provider, useDraft } = createDraft<AccessDraft>('Account access', {
  email: '',
  code: '',
  codeRefused: false,
  signedOutOthers: false,
});

export { Provider as AccessDraftProvider, useDraft as useAccessDraft };
