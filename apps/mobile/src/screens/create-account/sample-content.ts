import type { AvatarLook } from '@/components/avatar/look';

/**
 * Sample content on the Create account screens. Like the intro's, it is target-language demo
 * content and proper names, not UI copy, so it is not translated.
 */
export const SETUP = {
  /** The setup guide who runs the conversational onboarding (spec §6.1), and how she looks. */
  guide: {
    name: 'Mia',
    look: {
      skin: 'honey',
      hair: 'bob',
      hairColor: 'espresso',
      top: 'amber',
      backdrop: 'sand',
    } satisfies AvatarLook,
  },
  /** What the partner says on the microphone screen: "I'm listening!" */
  listening: 'Ich höre zu!',
  /** The greeting on the All set screen. */
  greeting: (name: string) => (name ? `Hallo, ${name}!` : 'Hallo!'),
} as const;

/** The AI providers named on 2.5. Company names are never translated. */
export const AI_PROVIDER = {
  openai: 'OpenAI',
  elevenlabs: 'ElevenLabs',
  bedrock: 'AWS Bedrock',
} as const;
