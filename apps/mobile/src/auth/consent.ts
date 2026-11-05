import type { AiConsent, AiConsentChoices } from './types';

/**
 * How consent is written on the account (Cognito custom attributes, until the profile database
 * exists). Each record carries its own date, so it stays a usable consent record on its own.
 */

/** Version of the 2.5 consent text. Bump it when the providers or what they receive change. */
// v2 (2026-10-23): OpenAI alone, with everything it does; ElevenLabs and Bedrock are not asked.
// v3 (2026-11-06): ElevenLabs is named, optional and off until the learner turns it on (it reads
// text aloud and receives that text only, spec §6.21.2). Bedrock is still not asked.
export const AI_CONSENT_VERSION = 'v3';

/** The first version of the consent text that names ElevenLabs: a record before it says nothing
 * about it, whatever its flag holds, and the server counts it the same way. */
const ELEVENLABS_FROM_VERSION = 3;

/** Nobody is asked about Bedrock, so it is not agreed to. The record keeps its fields so that it
 * reads the same once it is. ElevenLabs is the learner's choice (off by default). */
export const NO_OPTIONAL_PROVIDERS: AiConsentChoices = { elevenlabs: false, bedrock: false };

/** Whether the record is of a consent text that names ElevenLabs (the learner has seen it). */
export function consentNamesElevenLabs(consent: AiConsent | null | undefined): boolean {
  return !!consent && Number(consent.version.replace(/^v/, '')) >= ELEVENLABS_FROM_VERSION;
}

/** Whether the learner agreed to ElevenLabs reading text aloud, on a record that names it. */
export function agreedToElevenLabs(consent: AiConsent | null | undefined): boolean {
  return consentNamesElevenLabs(consent) && !!consent?.providers.elevenlabs;
}

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
