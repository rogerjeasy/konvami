import type { AvatarLook } from '@/components/avatar/look';

/**
 * Sample learner content shown in the intro illustrations: a German learner talking with the
 * persona Lena. This is target-language demo content, not UI copy, so it is not translated
 * (the glosses and labels around it are, in src/i18n). Numbers are illustrative, not user data.
 */
export const SAMPLE = {
  persona: {
    name: 'Lena',
    look: {
      skin: 'sand',
      hair: 'long',
      hairColor: 'chestnut',
      top: 'teal',
      backdrop: 'mist',
    } satisfies AvatarLook,
  },
  chat: {
    personaLine: 'Na, wie war dein Wochenende?',
    learnerLine: 'Super! Ich war auf einem Konzert.',
  },
  correction: {
    /** The learner's sentence, split around the mistake. */
    before: 'Ich ',
    wrong: 'habe',
    after: ' gestern nach Hause gegangen.',
    correct: 'bin',
    /** The grammar rule behind it: movement verbs take "sein", not "haben". */
    rule: { verb: 'gehen', correct: 'sein', wrong: 'haben' },
    topic: 'Perfekt · sein',
    /** Recording length, seconds. */
    duration: 4,
    /** Waveform bar heights (pt) and how many are "played". */
    waveform: [8, 14, 18, 10, 16, 12, 18, 8, 14, 10, 16, 6],
    played: 5,
  },
  newWord: { word: 'das Konzert' },
  progress: {
    level: 'B1',
    /** Progress toward the level, 0–1. */
    toLevel: 0.68,
    streakDays: 12,
    /** Speaking minutes per weekday, Monday first; the last entry is today (not yet practised). */
    minutesByDay: [22, 34, 18, 40, 30, 46, 0],
    todayIndex: 5,
  },
} as const;
