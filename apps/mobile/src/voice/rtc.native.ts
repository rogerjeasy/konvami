import { NativeModules } from 'react-native';

import { createRtcSession, type RtcPeer, type RtcSession, type RtcStream } from './rtc-session';

type WebRtc = typeof import('react-native-webrtc');

/** The name react-native-webrtc registers its native half under. */
const NATIVE_MODULE = 'WebRTCModule';

/**
 * The WebRTC library, or null in a build without its native half (Expo Go). The native module is
 * looked for first, because the library throws while loading without it and a `try` here cannot
 * catch that: Metro catches a failing module load itself, reports it as a fatal error (the red
 * screen) and hands back `undefined`. It is loaded here and not at the top of the file so the
 * rest of the app keeps working in Expo Go.
 */
function loadWebRtc(): WebRtc | null {
  if (NativeModules[NATIVE_MODULE] == null) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('react-native-webrtc') as WebRtc;
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
