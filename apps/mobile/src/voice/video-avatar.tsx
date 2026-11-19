import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { VideoAvatarSession } from '@konvami/api-client';

/**
 * Realistic video avatars during a call (spec §6.20 P2). A vendor turns the partner's voice into
 * a talking face and streams it as video; the app shows that stream in place of the drawn
 * portrait. The partner's voice still comes from the call itself.
 *
 * No vendor is implemented yet (design note 2026-11-20-avatar-art-video): `VIDEO_CONNECTORS` is
 * empty, so a call never even asks the server for a session and every partner keeps its drawn
 * portrait. A vendor is added as a connector here and a provider on the server.
 */

/** A vendor's video of the partner's face for one call. */
export interface VideoFeed {
  /**
   * The video track's stream: a `MediaStream` in the browser, react-native-webrtc's stream on a
   * phone. `VideoFace` draws it.
   */
  stream: unknown;
  /** Ends the vendor's stream (and its billing). */
  close(): void;
}

/** Opens a vendor's stream from the session the server started. Rejects when it cannot. */
export type VideoConnector = (session: VideoAvatarSession) => Promise<VideoFeed>;

/** The vendors the app can show, by the name the server's sessions carry. */
export const VIDEO_CONNECTORS: Readonly<Record<string, VideoConnector>> = {};

export interface VideoAvatars {
  /** The partner's video face for a call starting now, or null for the drawn portrait. */
  open(personaId: string): Promise<VideoFeed | null>;
}

export function createVideoAvatars({
  start,
  connectors,
}: {
  start: (personaId: string) => Promise<VideoAvatarSession | null>;
  connectors: Readonly<Record<string, VideoConnector>>;
}): VideoAvatars {
  return {
    async open(personaId) {
      // Without a connector no face could be shown: the server is not asked.
      if (Object.keys(connectors).length === 0) return null;
      try {
        const session = await start(personaId);
        const connect = session ? connectors[session.vendor] : undefined;
        return session && connect ? await connect(session) : null;
      } catch {
        // A face that cannot be shown is never the reason a call fails: draw the portrait.
        return null;
      }
    },
  };
}

const DISABLED: VideoAvatars = { open: async () => null };
const VideoAvatarContext = createContext<VideoAvatars>(DISABLED);

export function VideoAvatarProvider({
  avatars,
  children,
}: {
  avatars: VideoAvatars;
  children: ReactNode;
}) {
  return <VideoAvatarContext.Provider value={avatars}>{children}</VideoAvatarContext.Provider>;
}

/**
 * The partner's video face while `active` (the call is live), or null. The stream is closed
 * when the call ends or the screen goes.
 */
export function useVideoAvatar(personaId: string | undefined, active: boolean): VideoFeed | null {
  const avatars = useContext(VideoAvatarContext);
  const [feed, setFeed] = useState<VideoFeed | null>(null);
  useEffect(() => {
    if (!personaId || !active) return;
    let current: VideoFeed | null = null;
    let gone = false;
    void avatars.open(personaId).then((opened) => {
      if (gone) opened?.close();
      else {
        current = opened;
        setFeed(opened);
      }
    });
    return () => {
      gone = true;
      current?.close();
      setFeed(null);
    };
  }, [avatars, personaId, active]);
  return feed;
}
