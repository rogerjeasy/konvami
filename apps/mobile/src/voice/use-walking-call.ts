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
  const generation = useRef(0);
  const pending = useRef<number | null>(null);
  const active = useRef(false);
  const latest = useRef({ call, leave });
  useEffect(() => {
    latest.current = { call, leave };
  }, [call, leave]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      generation.current += 1;
      active.current = false;
      session?.stop();
    };
  }, [session]);
  useEffect(() => {
    if (call.status === 'failed') {
      generation.current += 1;
      active.current = false;
      session?.stop();
    }
  }, [call.status, session]);
  useEffect(() => {
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'background' && !active.current) latest.current.leave();
    });
    return () => listener.remove();
  }, []);
  return {
    enabled: enabled && call.status === 'live',
    busy,
    failed,
    available: session !== null,
    async set(value: boolean) {
      if (!session) return;
      if (!value) {
        // Disabling must cancel permission prompts too, before React renders the new state.
        generation.current += 1;
        active.current = false;
        session.stop();
        setEnabled(false);
        // Do not overlap two native notification starts while the cancelled one is draining.
        if (pending.current === null) setBusy(false);
        setFailed(false);
        return;
      }
      if (pending.current !== null || latest.current.call.status !== 'live') return;
      const request = ++generation.current;
      pending.current = request;
      const current = () =>
        alive.current && generation.current === request && latest.current.call.status === 'live';
      setFailed(false);
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
              if (
                current() &&
                !latest.current.call.pushToTalk &&
                latest.current.call.muted !== muted
              )
                latest.current.call.toggleMute();
            },
            stop: () => {
              if (current()) latest.current.leave();
            },
          },
        );
        if (current()) {
          active.current = true;
          setEnabled(true);
        }
      } catch {
        if (current()) setFailed(true);
      } finally {
        if (pending.current === request) {
          pending.current = null;
          if (alive.current) setBusy(false);
        }
      }
    },
  };
}
