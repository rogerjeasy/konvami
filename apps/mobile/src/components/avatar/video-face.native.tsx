import { NativeModules, View } from 'react-native';
import type { VideoFeed } from '@/voice/video-avatar';

type WebRtc = typeof import('react-native-webrtc');

// The name react-native-webrtc registers its native half under (as in `voice/rtc.native.ts`).
const NATIVE_MODULE = 'WebRTCModule';

/** react-native-webrtc, or null in a build without its native half (Expo Go). */
function loadWebRtc(): WebRtc | null {
  if (NativeModules[NATIVE_MODULE] == null) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('react-native-webrtc') as WebRtc;
}

/**
 * A partner's video face (spec §6.20 P2) in the avatar's round frame, on a phone. The stream's
 * audio is not played: the voice comes from the call itself. Decorative, like the drawn portrait.
 */
export function VideoFace({ feed, size }: { feed: VideoFeed; size: number }) {
  const webrtc = loadWebRtc();
  const stream = feed.stream as { toURL(): string };
  return (
    <View
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
    >
      {webrtc ? (
        <webrtc.RTCView
          streamURL={stream.toURL()}
          objectFit="cover"
          style={{ width: '100%', height: '100%' }}
        />
      ) : null}
    </View>
  );
}
