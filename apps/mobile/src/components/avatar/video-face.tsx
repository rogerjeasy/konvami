import { createElement, useEffect, useRef } from 'react';
import { View } from 'react-native';
import type { VideoFeed } from '@/voice/video-avatar';

/**
 * A partner's video face (spec §6.20 P2) in the avatar's round frame, in the browser (the web
 * preview). Phones use `video-face.native.tsx`. Muted: the voice comes from the call itself.
 * Decorative, like the drawn portrait: the screen says in words what is happening.
 */
export function VideoFace({ feed, size }: { feed: VideoFeed; size: number }) {
  const video = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    if (video.current) video.current.srcObject = feed.stream as MediaStream;
  }, [feed]);
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
      {createElement('video', {
        ref: video,
        autoPlay: true,
        playsInline: true,
        muted: true,
        style: { width: '100%', height: '100%', objectFit: 'cover' },
      })}
    </View>
  );
}
