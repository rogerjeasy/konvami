/** Why a voice call could not start or did not continue, in the app's own terms. */
export type VoiceErrorCode =
  /** This build has no WebRTC (Expo Go): voice needs a development or store build. */
  | 'unsupported'
  /** The person, or the system, refused the microphone. */
  | 'mic_denied'
  | 'no_microphone'
  /** The account has not agreed to the voice provider (2.5 AI data consent). */
  | 'consent_required'
  /** The learner's voice minutes for this week are used up (they come back on Monday). */
  | 'minutes_used_up'
  /** Voice calls are stopped for everyone for now: the month's spending reached its ceiling. */
  | 'voice_paused'
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
