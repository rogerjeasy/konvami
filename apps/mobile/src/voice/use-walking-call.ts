import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { VoiceCall } from './use-voice-call';
import { createWalkingSession } from './walking-session';

export function useWalkingCall(call: VoiceCall, leave: () => void) {
  const { t } = useTranslation();
  const session = useMemo(() => createWalkingSession(), []);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const alive = useRef(true);
  const latest = useRef({ call, leave });
  useEffect(() => {
    latest.current = { call, leave };
  }, [call, leave]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      session?.stop();
    };
  }, [session]);
  useEffect(() => {
    if (call.status === 'failed') {
      session?.stop();
    }
  }, [call.status, session]);
  useEffect(() => {
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'background' && !enabled) latest.current.leave();
    });
    return () => listener.remove();
  }, [enabled]);
  return {
    enabled: enabled && call.status === 'live',
    busy,
    failed,
    available: session !== null,
    async set(value: boolean) {
      if (!session || busy) return;
      setFailed(false);
      if (!value) {
        session.stop();
        setEnabled(false);
        return;
      }
      setBusy(true);
      try {
        // Walking is hands-free: press-to-talk cannot remain enabled with the screen off.
        latest.current.call.setPushToTalk(false);
        await session.start(
          {
            title: t('call.walking'),
            detail: t('call.walkingHint'),
            pause: t('call.mute'),
            resume: t('call.unmute'),
            stop: t('conversation.end'),
          },
          {
            mute: (muted) => {
              if (latest.current.call.muted !== muted) latest.current.call.toggleMute();
            },
            stop: () => latest.current.leave(),
          },
        );
        if (alive.current) setEnabled(true);
      } catch {
        if (alive.current) setFailed(true);
      } finally {
        if (alive.current) setBusy(false);
      }
    },
  };
}
