import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import type { VideoAvatarSession } from '@konvami/api-client';
import {
  createVideoAvatars,
  useVideoAvatar,
  VideoAvatarProvider,
  type VideoAvatars,
  type VideoFeed,
} from './video-avatar';

const SESSION: VideoAvatarSession = {
  id: 'session-1',
  vendor: 'facely',
  connectUrl: 'https://stream.example/session',
  token: 'short-lived',
  expiresAt: 1_900_000_000,
};

const feed = (): VideoFeed => ({ stream: {}, close: jest.fn() });

describe('createVideoAvatars', () => {
  it('does not ask the server while no vendor can be shown', async () => {
    const start = jest.fn(async () => SESSION);

    const opened = await createVideoAvatars({ start, connectors: {} }).open('lena');

    expect(opened).toBeNull();
    expect(start).not.toHaveBeenCalled();
  });

  it('opens the vendor’s stream for the session the server started', async () => {
    const video = feed();
    const connect = jest.fn(async () => video);
    const avatars = createVideoAvatars({
      start: async () => SESSION,
      connectors: { facely: connect },
    });

    expect(await avatars.open('lena')).toBe(video);
    expect(connect).toHaveBeenCalledWith(SESSION);
  });

  it('draws the portrait when there is no session, no connector or a failure', async () => {
    const connect = async () => feed();

    const none = createVideoAvatars({ start: async () => null, connectors: { facely: connect } });
    const other = createVideoAvatars({
      start: async () => ({ ...SESSION, vendor: 'other' }),
      connectors: { facely: connect },
    });
    const broken = createVideoAvatars({
      start: async () => SESSION,
      connectors: {
        facely: async () => {
          throw new Error('down');
        },
      },
    });

    expect(await none.open('lena')).toBeNull();
    expect(await other.open('lena')).toBeNull();
    expect(await broken.open('lena')).toBeNull();
  });
});

describe('useVideoAvatar', () => {
  const wrapper = (avatars: VideoAvatars) =>
    function Wrapper({ children }: { children: ReactNode }) {
      return <VideoAvatarProvider avatars={avatars}>{children}</VideoAvatarProvider>;
    };

  it('shows nothing without a provider', async () => {
    const { result } = await renderHook(() => useVideoAvatar('lena', true));

    expect(result.current).toBeNull();
  });

  it('opens the face once the call is live and closes it when the call ends', async () => {
    const video = feed();
    const open = jest.fn(async () => video);
    const { result, rerender } = await renderHook(
      ({ active }: { active: boolean }) => useVideoAvatar('lena', active),
      { initialProps: { active: false }, wrapper: wrapper({ open }) },
    );
    expect(open).not.toHaveBeenCalled();

    await rerender({ active: true });
    await waitFor(() => expect(result.current).toBe(video));

    await rerender({ active: false });
    expect(result.current).toBeNull();
    expect(video.close).toHaveBeenCalled();
  });
});
