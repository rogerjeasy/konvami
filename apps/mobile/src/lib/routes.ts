import type { Href } from 'expo-router';

/** Every route the app navigates to, in one place (no path strings scattered across screens). */
export const ROUTES = {
  launch: '/',
  intro: '/intro',
  welcome: '/welcome',
  /** 2.1 Age check: the first step of creating an account. */
  createAccount: '/age-check',
  /** Shown instead of the next step to someone under the minimum age. */
  ageRestricted: '/age-restricted',
  /** 2.2 Create account: choose Apple, Google or email. */
  signUpOptions: '/create-account',
  /** 2.3 Sign up with email. */
  signUpEmail: '/sign-up-email',
  /** 2.4 Verify email. */
  verifyEmail: '/verify-email',
  /** 2.5 AI data consent. */
  aiConsent: '/ai-consent',
  /** 2.6 Microphone. */
  microphone: '/microphone',
  /** 2.7 All set. */
  allSet: '/all-set',
  /** 3.1 Sign in (and 3.2, its error state). */
  signIn: '/sign-in',
  /** 3.3 Welcome back: a signed-in user unlocks with Face ID at launch. */
  welcomeBack: '/welcome-back',
  /** 3.5 Forgot password. */
  forgotPassword: '/forgot-password',
  /** 3.6 Check your email: enter the reset code. */
  resetCode: '/reset-code',
  /** 3.7 New password. */
  newPassword: '/new-password',
  /** 3.8 Password updated. */
  passwordUpdated: '/password-updated',
  /** Where a signed-in user lands. A placeholder until onboarding and the home screen exist. */
  home: '/home',
  /** Placeholder for pages that do not exist yet (Terms of Use, Privacy Policy). */
  comingNext: '/coming-next',
} as const satisfies Record<string, Href>;
