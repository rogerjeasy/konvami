import { api } from '@/api';
import { createClipPlayer } from '@/lib/clip-player';
import { getPreferences } from '@/preferences';
import { calendarDateOf, toIsoDate } from '@/lib/dates';
import { createVoiceEngine } from './engine';
import { createPlatformRtcSession } from './rtc';
import type { VoiceEngineFactory } from './services';

export * from './conversation';
export * from './engine';
export * from './services';
export * from './use-voice-call';
export * from './sentence-recorder';
export { useAppSentenceRecorder } from './app-recorder';

/** The app's voice engine: WebRTC on this platform, calls created through the Konvami API. */
export const createAppVoiceEngine: VoiceEngineFactory = (
  purpose,
  personaId,
  scenario,
  practise,
  options,
) =>
  createVoiceEngine({
    createSession: createPlatformRtcSession,
    clips: createClipPlayer(),
    ...(purpose === 'practice'
      ? {
          continueCall: (rootId: string, attemptId: string, sdpOffer: string) =>
            api.continueVoiceCall(rootId, attemptId, sdpOffer),
          endCall: (rootId: string) => api.endVoiceCall(rootId),
        }
      : {}),
    startCall: (sdpOffer) =>
      api.startVoiceCall(purpose, sdpOffer, {
        personaId,
        // A second partner speaks as a clip, so the lead keeps the call's own voice (no premium).
        ...(options?.guestId ? { guestPersonaId: options.guestId } : {}),
        ...(purpose === 'practice' && getPreferences().premiumCalls && !options?.guestId
          ? { premium: true }
          : {}),
        ...(purpose === 'exam' && options?.assessmentConsent ? { assessmentConsent: true } : {}),
        localDate: toIsoDate(calendarDateOf(new Date())),
        scenario,
        practise,
      }),
  });
