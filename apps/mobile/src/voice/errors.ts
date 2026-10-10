/** Why a voice call could not start or did not continue, in the app's own terms. */
export type VoiceErrorCode =
  /** This build has no WebRTC (Expo Go): voice needs a development or store build. */
  | 'unsupported'
  /** The person, or the system, refused the microphone. */
  | 'mic_denied'
  | 'no_microphone'
  /** The account has not agreed to the voice provider (2.5 AI data consent). */
  | 'consent_required'
  /** The day's calls are used up. */
  | 'call_limit'
  /** The voice service cannot take a call right now. */
  | 'voice_unavailable'
  | 'network'
  /** `stop()` was called while the call was still starting. */
  | 'stopped'
  | 'unknown';

/** Carries a code and nothing else, so it can be logged or shown without leaking call data. */
export class VoiceError extends Error {
  readonly code: VoiceErrorCode;

  constructor(code: VoiceErrorCode) {
    super(`Voice error: ${code}`);
    this.name = 'VoiceError';
    this.code = code;
  }
}
