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
  /** 5.19 Phrasebook: the phrases the learner needs in their life, to keep and to learn. */
  phrasebook: '/phrasebook',
  /** 5.29 Stories: listening episodes made around the learner's words (`storyRoute`). */
  stories: '/stories',
  /** 5.30 Commute drill: a hands-free drill call for walking or travelling (`drillCallRoute`). */
  drill: '/drill',
  /** 5.20 Then vs Now: the learner's voice from their first weeks next to a recent conversation. */
  thenVsNow: '/then-vs-now',
  /** 5.22 Pronunciation lab: drills for the sounds that are hard, and the learner's missed words. */
  pronunciation: '/pronunciation',

  /** 5.23 Import: what the learner brings (a text, a page, a photo) and what was made of it. */
  import: '/import',

  /** 5.21 Pen-pal: the voice notes a partner sends, and the learner's answers (`penPalRoute`). */
  penPal: '/pen-pal',
  /** 5.13 Role-plays: the real-life situations a learner can rehearse. */
  rolePlays: '/role-plays',
  /** 5.24 Choose two partners: a conversation with two of the learner's partners at once. */
  together: '/together',
  /** 5.26 Coach: what to do next and why, from what the learner did. */
  coach: '/coach',
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
  /** 6.17 Plan: what the learner has bought, their voice minutes and the plans on offer. */
  accountPlan: '/account/plan',
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
  /** 6.14 Changes made by voice: what partners changed in the settings, with Undo. */
  accountChanges: '/account/changes',
  /** 6.22 Read-aloud voice: the premium voice (ElevenLabs) for cards and check-ins (spec §6.21.2). */
  accountReadAloud: '/account/read-aloud',
  /** 6.12 Costs: what Konvami spends, for the owner's account only (spec §6.19). */
  accountCosts: '/account/costs',
  /** 6.15 Reports: what learners flagged, for the owner's account only (spec §16.1). */
  accountFlags: '/account/flags',
  /** 6.20 Help and feedback: the FAQ, support and the feedback form (spec §6.21.4). */
  accountHelp: '/account/help',
  /** 6.21 Feedback: what learners sent, for the owner's account only (spec §6.21.4). */
  accountFeedbackInbox: '/account/feedback',
  /** Placeholder for pages that do not exist yet (Terms of Use, Privacy Policy). */

  /** 6.19 Export my data: a copy of everything Konvami keeps about the learner. */
  accountExport: '/account/export',
  /** 6.18 Terms of Use and Privacy Policy, shown by the app until a website address is set. */
  legalTerms: '/legal/terms',
  legalPrivacy: '/legal/privacy',
  /** Placeholder for pages that do not exist yet. */
  comingNext: '/coming-next',
} as const satisfies Record<string, Href>;

/** 4.7 Edit one starter partner: their name and look. */
/** 5.21 The pen-pal thread with one partner; without one, with the partner who wrote last. */
export const penPalRoute = (personaId?: string) =>
  ({
    pathname: '/pen-pal',
    params: personaId ? { partner: personaId } : {},
  }) as const satisfies Href;

export const partnerRoute = (id: string) =>
  ({ pathname: '/onboarding/partners/[id]', params: { id } }) as const satisfies Href;

/**
 * 5.3 A live conversation with one of the learner's partners; with `scenario`, a role-play; with
 * `practise`, one that practises a grammar topic first; with `guest`, a second partner joins
 * (5.24) and `personaId` leads; with `rang`, a short call the learner accepted from the
 * partner's ring (5.28); with `walking`, walking mode turns on once the call is live.
 */
export const callRoute = (
  personaId: string,
  {
    scenario,
    practise,
    guest,
    rang,
    walking,
  }: {
    scenario?: string;
    practise?: string;
    guest?: string;
    rang?: boolean;
    walking?: boolean;
  } = {},
) =>
  ({
    pathname: '/call/[personaId]',
    params: {
      personaId,
      ...(scenario ? { scenario } : {}),
      ...(practise ? { practise } : {}),
      ...(guest ? { guest } : {}),
      ...(rang ? { rang: '1' } : {}),
      ...(walking ? { walking: '1' } : {}),
    },
  }) as const satisfies Href;

/**
 * 5.28 A partner is calling: the screen a tapped ring opens (`ask` is the partner's question,
 * when the ring is about an event).
 */
export const incomingCallRoute = (personaId: string, ask?: string) =>
  ({
    pathname: '/incoming-call',
    params: { partner: personaId, ...(ask ? { ask } : {}) },
  }) as const satisfies Href;

/**
 * 5.3 A hands-free drill (5.30): rounds of prompt, answer and recast over the due words and the
 * learner's corrected sentences, in walking mode where the device has it. The server reads
 * `drill` in the call's `practise`.
 */
export const drillCallRoute = (personaId: string) =>
  callRoute(personaId, { practise: 'drill', walking: true });

/** 5.29 One episode of the listening series. */
export const storyRoute = (id: string) =>
  ({ pathname: '/stories/[id]', params: { id } }) as const satisfies Href;

/**
 * 5.3 A guided lesson (spec §6.3) on a grammar topic: a short call that explains it, gives
 * examples, has the learner produce it, corrects them and ends in free use. The server reads
 * `lesson:<topic>` in the call's `practise`.
 */
export const lessonCallRoute = (personaId: string, topic: string) =>
  callRoute(personaId, { practise: `lesson:${topic}` });

/**
 * 5.3 A short spoken re-check of one group of settings ("Ask me again", spec §14.2): a call in
 * which the partner reads them out and changes what is no longer right.
 */
export const recheckCallRoute = (personaId: string, group: 'learning' | 'goals') =>
  callRoute(personaId, { practise: `check:${group}` });

/** 5.23 One import worked out: its summary, words, grammar and sentences. */
export const importRoute = (id: string) =>
  ({ pathname: '/import/[id]', params: { id } }) as const satisfies Href;

/**
 * 5.3 A conversation about something the learner imported (spec §6.17). The server reads
 * `import:<id>` in the call's `practise`, with the id as 32 hex digits (the call's `practise`
 * is at most 40 characters).
 */
export const importCallRoute = (personaId: string, importId: string) =>
  callRoute(personaId, { practise: `import:${importId.replaceAll('-', '')}` });

/** 5.3 The reply or phone call an imported letter asks for, rehearsed (the letters helper). */
export const letterCallRoute = (personaId: string, importId: string) =>
  callRoute(personaId, { practise: `letter:${importId.replaceAll('-', '')}` });

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

/** 6.16 The avatar editor for one of the learner's partners (reached from 6.6 Look). */
export const avatarRoute = (id: string) =>
  ({ pathname: '/account/partners/avatar/[id]', params: { id } }) as const satisfies Href;

/** 6.11 One thing the learner's partners know, to reword or forget. */
export const memoryRoute = (id: string) =>
  ({ pathname: '/account/memory/[id]', params: { id } }) as const satisfies Href;

/** 5.15 One topic of the grammar map. */
export const grammarTopicRoute = (topic: string) =>
  ({ pathname: '/grammar/[topic]', params: { topic } }) as const satisfies Href;

/** 5.22 One sound of the pronunciation lab. */
export const pronunciationSoundRoute = (sound: string) =>
  ({ pathname: '/pronunciation/[sound]', params: { sound } }) as const satisfies Href;

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

/** 5.25 The phrases that help in a speaking test, by what they do. */
export const examPhrasesRoute = (exam: string) =>
  ({ pathname: '/exams/[exam]/phrases', params: { exam } }) as const satisfies Href;

/** 5.17 The simulation itself: a call with the examiner. */
export const examTalkRoute = (exam: string) =>
  ({ pathname: '/exams/[exam]/talk', params: { exam } }) as const satisfies Href;

/** 5.18 One simulation's estimated score. */
export const simulationRoute = (id: string) =>
  ({ pathname: '/exams/simulations/[id]', params: { id } }) as const satisfies Href;
