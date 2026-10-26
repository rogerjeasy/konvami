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
  /** 4.1 Talk with Mia: the spoken setup. */
  onboardingTalk: '/onboarding/talk',
  /** 4.2 Onboarding form, one route per essential question (spec §6.1.1 step 3). */
  onboardingLanguage: '/onboarding/language',
  onboardingExplanations: '/onboarding/explanations',
  onboardingGoals: '/onboarding/goals',
  onboardingLevel: '/onboarding/level',
  onboardingCourse: '/onboarding/course',
  /** 4.3 Review: "Here's what I noted". */
  onboardingReview: '/onboarding/review',
  /** 4.4 Placement intro, 4.5 the spoken test, 4.6 its result. */
  onboardingPlacement: '/onboarding/placement',
  onboardingPlacementTalk: '/onboarding/placement/talk',
  onboardingPlacementResult: '/onboarding/placement/result',
  /** 4.7 Starter partners (one of them is edited at `partnerRoute(id)`). */
  onboardingPartners: '/onboarding/partners',
  /** 4.8 Ready: the summary before entering the app. */
  onboardingReady: '/onboarding/ready',
  /**
   * Where a signed-in user lands: it continues onboarding where they left off, and enters the
   * app (`today`) once that is done.
   */
  home: '/home',
  /** 5.1 Today, 5.2 Talk, 5.5 Library, 5.7 Learn, 5.8 Progress: the five tabs of the app. */
  today: '/today',
  talk: '/talk',
  library: '/library',
  learn: '/learn',
  progress: '/progress',
  /** 5.11 Review: the flashcards that are due, one at a time. */
  review: '/review',
  /** 5.12 Ask the tutor (a question about a report's correction is `explainRoute`). */
  tutor: '/tutor',
  /** 5.13 Role-plays: the real-life situations a learner can rehearse. */
  rolePlays: '/role-plays',
  /** 5.16 Exam centre: simulated speaking tests, their scores and how ready the learner is. */
  exams: '/exams',
  /** 5.14 Grammar map: every topic of the language learned, and how well the learner uses it. */
  grammar: '/grammar',
  /** 6.1 Profile: who the learner is, and the way to everything about their account. */
  account: '/account',
  /** 6.2 Personal: name, photo, app language. */
  accountPersonal: '/account/personal',
  /** 6.3 Learning: what the app knows about the learner's learning. */
  accountLearning: '/account/learning',
  /** 6.3 Your goals: a weekly habit and a level to reach, which the week's plan follows. */
  accountGoals: '/account/goals',
  /** 6.13 Reminders: practice reminders on this device (spec §6.18). */
  accountReminders: '/account/reminders',
  /** 6.4 My partners, 6.5 New partner and 6.6 Persona Studio for a partner still to be added. */
  accountPartners: '/account/partners',
  accountNewPartner: '/account/partners/new',
  accountStudio: '/account/partners/studio',
  /** 6.7 Privacy and AI. */
  accountPrivacy: '/account/privacy',
  /** 6.10 What my partners know (one memory is changed at `memoryRoute(id)`). */
  accountMemory: '/account/memory',
  /** 6.8 Security, with its two forms. */
  accountSecurity: '/account/security',
  accountPassword: '/account/security/password',
  accountEmail: '/account/security/email',
  /** 6.9 Delete account. */
  accountDelete: '/account/delete',
  /** 6.12 Costs: what Konvami spends, for the owner's account only (spec §6.19). */
  accountCosts: '/account/costs',
  /** Placeholder for pages that do not exist yet (Terms of Use, Privacy Policy). */
  comingNext: '/coming-next',
} as const satisfies Record<string, Href>;

/** 4.7 Edit one starter partner: their name and look. */
export const partnerRoute = (id: string) =>
  ({ pathname: '/onboarding/partners/[id]', params: { id } }) as const satisfies Href;

/**
 * 5.3 A live conversation with one of the learner's partners; with `scenario`, a role-play; with
 * `practise`, one that practises a grammar topic first.
 */
export const callRoute = (
  personaId: string,
  { scenario, practise }: { scenario?: string; practise?: string } = {},
) =>
  ({
    pathname: '/call/[personaId]',
    params: {
      personaId,
      ...(scenario ? { scenario } : {}),
      ...(practise ? { practise } : {}),
    },
  }) as const satisfies Href;

/** 5.7 Learn with one card open, as a word of the day opens it. */
export const learnCardRoute = (card: string) =>
  ({ pathname: '/learn', params: { card } }) as const satisfies Href;

/** 5.11 Review, answering each card out loud instead of turning it over (voice review). */
export const reviewAloudRoute = {
  pathname: '/review',
  params: { aloud: '1' },
} as const satisfies Href;

/** 5.3 A review conversation (spec §6.7): a call built around the learner's due words. */
export const reviewCallRoute = (personaId: string) => callRoute(personaId, { practise: 'words' });

/** 5.6 One past conversation, to read again. */
export const conversationRoute = (id: string) =>
  ({ pathname: '/conversations/[id]', params: { id } }) as const satisfies Href;

/** 5.4 What a conversation that has just ended added up to. */
export const conversationDoneRoute = (id: string) =>
  ({ pathname: '/conversations/[id]/done', params: { id } }) as const satisfies Href;

/** 5.10 The Session Report on one conversation: what it showed and what to practise next. */
export const reportRoute = (id: string) =>
  ({ pathname: '/conversations/[id]/report', params: { id } }) as const satisfies Href;

/** 6.6 Persona Studio for one of the learner's partners. */
export const studioRoute = (id: string) =>
  ({ pathname: '/account/partners/[id]', params: { id } }) as const satisfies Href;

/** 6.11 One thing the learner's partners know, to reword or forget. */
export const memoryRoute = (id: string) =>
  ({ pathname: '/account/memory/[id]', params: { id } }) as const satisfies Href;

/** 5.15 One topic of the grammar map. */
export const grammarTopicRoute = (topic: string) =>
  ({ pathname: '/grammar/[topic]', params: { topic } }) as const satisfies Href;

/** 5.12 Ask the tutor, with `question` written in the field, ready to send. */
export const askTutorRoute = (question: string) =>
  ({ pathname: '/tutor', params: { question } }) as const satisfies Href;

/** 5.12 Ask the tutor, asking at once about correction `index` of a conversation's report. */
export const explainRoute = (conversationId: string, index: number) =>
  ({
    pathname: '/tutor',
    params: { conversation: conversationId, correction: String(index) },
  }) as const satisfies Href;

/** 5.17 Preparing a simulation of a speaking test: its cards and the preparation time. */
export const examPrepRoute = (exam: string) =>
  ({ pathname: '/exams/[exam]', params: { exam } }) as const satisfies Href;

/** 5.17 The simulation itself: a call with the examiner. */
export const examTalkRoute = (exam: string) =>
  ({ pathname: '/exams/[exam]/talk', params: { exam } }) as const satisfies Href;

/** 5.18 One simulation's estimated score. */
export const simulationRoute = (id: string) =>
  ({ pathname: '/exams/simulations/[id]', params: { id } }) as const satisfies Href;
