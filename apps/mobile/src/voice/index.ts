import { api } from '@/api';
import { calendarDateOf, toIsoDate } from '@/lib/dates';
import { createVoiceEngine } from './engine';
import { createPlatformRtcSession } from './rtc';
import type { VoiceEngineFactory } from './services';

export * from './conversation';
export * from './engine';
export * from './services';
export * from './use-voice-call';

/** The app's voice engine: WebRTC on this platform, calls created through the Konvami API. */
export const createAppVoiceEngine: VoiceEngineFactory = (purpose, personaId, scenario) =>
  createVoiceEngine({
    createSession: createPlatformRtcSession,
    startCall: (sdpOffer) =>
      api.startVoiceCall(purpose, sdpOffer, {
        personaId,
        localDate: toIsoDate(calendarDateOf(new Date())),
        scenario,
      }),
  });
