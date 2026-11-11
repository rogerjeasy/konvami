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
export const createAppVoiceEngine: VoiceEngineFactory = (purpose, personaId, scenario, practise) =>
  createVoiceEngine({
    createSession: createPlatformRtcSession,
    clips: createClipPlayer(),
    startCall: (sdpOffer) =>
      api.startVoiceCall(purpose, sdpOffer, {
        personaId,
        ...(purpose === 'practice' && getPreferences().premiumCalls ? { premium: true } : {}),
        localDate: toIsoDate(calendarDateOf(new Date())),
        scenario,
        practise,
      }),
  });
