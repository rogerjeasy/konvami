import { createRtcSession, type RtcPeer, type RtcSession, type RtcStream } from './rtc-session';

type WebRtc = typeof import('react-native-webrtc');

/**
 * The native WebRTC module, or null in a build without it. Expo Go has no such module and the
 * library throws when it is loaded there, so it is loaded here, guarded, and not at the top of
 * the file: the rest of the app must keep working in Expo Go.
 */
function loadWebRtc(): WebRtc | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('react-native-webrtc') as WebRtc;
  } catch {
    return null;
  }
}

/** A WebRTC session on iOS and Android, or null when this build cannot make voice calls. */
export function createPlatformRtcSession(): RtcSession | null {
  const webrtc = loadWebRtc();
  if (!webrtc) return null;
  return createRtcSession({
    createPeer: () => new webrtc.RTCPeerConnection() as unknown as RtcPeer,
    // The native stack applies echo cancellation, noise suppression and gain control to a voice
    // call by default; it does not take the browser's per-option switches.
    getMicrophone: () =>
      webrtc.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      }) as unknown as Promise<RtcStream>,
    // The native WebRTC stack plays incoming audio by itself.
    playAudio: () => {},
  });
}
