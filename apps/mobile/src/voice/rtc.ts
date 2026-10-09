import { createRtcSession, type RtcPeer, type RtcSession, type RtcStream } from './rtc-session';

/**
 * A WebRTC session in the browser (the web preview). Phones use `rtc.native.ts`, which Metro
 * picks instead of this file on iOS and Android.
 */
export function createPlatformRtcSession(): RtcSession | null {
  const media = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices;
  if (typeof RTCPeerConnection === 'undefined' || !media?.getUserMedia) return null;
  // The browser plays the persona's voice through an audio element that is never shown.
  const speaker = new Audio();
  speaker.autoplay = true;
  return createRtcSession({
    createPeer: () => new RTCPeerConnection() as unknown as RtcPeer,
    getMicrophone: (audio) => media.getUserMedia({ audio }) as Promise<RtcStream>,
    playAudio: (stream) => {
      speaker.srcObject = stream as MediaStream;
    },
  });
}
