import type { AiConsent, AiConsentChoices } from './types';

/**
 * How consent is written on the account (Cognito custom attributes, until the profile database
 * exists). Each record carries its own date, so it stays a usable consent record on its own.
 */

/** Version of the 2.5 consent text. Bump it when the providers or what they receive change. */
// v2 (2026-10-23): OpenAI alone, with everything it does; ElevenLabs and Bedrock are not asked.
export const AI_CONSENT_VERSION = 'v2';

/** The optional providers, none of which is in use: nobody is asked about them, so none is
 * agreed to. The record keeps its fields so that it reads the same once they are. */
export const NO_OPTIONAL_PROVIDERS: AiConsentChoices = { elevenlabs: false, bedrock: false };

const flag = (on: boolean) => (on ? '1' : '0');

/** `v2|2026-10-09T12:30:00.000Z|openai=1,elevenlabs=0,bedrock=0` */
export function encodeAiConsent(choices: AiConsentChoices, at: Date): string {
  const providers = `openai=1,elevenlabs=${flag(choices.elevenlabs)},bedrock=${flag(choices.bedrock)}`;
  return [AI_CONSENT_VERSION, at.toISOString(), providers].join('|');
}

/** The stored record, or null when there is none or it cannot be trusted (so the user is asked again). */
export function decodeAiConsent(stored: string | undefined): AiConsent | null {
  const [version, at, providers] = (stored ?? '').split('|');
  if (!version || !at || !providers || Number.isNaN(Date.parse(at))) return null;
  const flags = Object.fromEntries(providers.split(',').map((pair) => pair.split('=')));
  // Without the required provider there is no valid consent.
  if (flags.openai !== '1') return null;
  return {
    version,
    at,
    providers: {
      openai: true,
      elevenlabs: flags.elevenlabs === '1',
      bedrock: flags.bedrock === '1',
    },
  };
}

/** `1|2026-10-09`: the email-tips choice and the day it was made. */
export function encodeTipsOptIn(optIn: boolean, at: Date): string {
  return `${flag(optIn)}|${at.toISOString().slice(0, 10)}`;
}
