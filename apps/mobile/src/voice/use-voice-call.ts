import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { motion } from '@konvami/design-tokens';
import type { CallPlan, CallPurpose } from '@konvami/api-client';
import { mouthOpenness } from '@/lib/lip-sync';
import { conversationReducer, INITIAL_CONVERSATION, type ConversationState } from './conversation';
import { VoiceError, type StartedCall, type VoiceEngine, type VoiceErrorCode } from './engine';
import type { HelpKind } from './help';
import { useVoiceEngineFactory } from './services';

/** Why a call is not running: it could not start, or its connection dropped (`lost`). */
export type CallProblem = VoiceErrorCode | 'lost';

export interface VoiceCall {
  status: 'starting' | 'live' | 'failed';
  problem: CallProblem | null;
  /** The call's id on the server and its time limit (seconds); null until it is live. */
  callId: string | null;
  maxSeconds: number | null;
  /** What a practice conversation sets out to practise; null until it is live, and for others. */
  plan: CallPlan | null;
  conversation: ConversationState;
  muted: boolean;
  toggleMute: () => void;
  /** Says a line for the learner without their voice (see `VoiceEngine.say`). */
  say: (text: string) => void;
  /** Asks the partner for help (see `VoiceEngine.help`). */
  help: (kind: HelpKind) => void;
  /** Ends the call. Also happens by itself when the screen goes away. */
  stop: () => void;
  /** How far the persona's mouth is open, 0–1 (for the avatar). */
  mouth: SharedValue<number>;
  /** How loud the learner is, 0–1 (for the listening ring). */
  voice: SharedValue<number>;
}

// How often the voice levels are read (ms): fast enough for lips, slow enough to cost nothing.
const LEVEL_INTERVAL_MS = 100;

/**
 * One live voice call for the life of the component that uses it: it starts on mount and ends
 * on unmount. To try again after a failure, mount the component anew (a new `key`). A practice
 * call names the partner to talk to (`personaId`), for a role-play its `scenario`, and a grammar
 * topic to practise first (`practise`).
 */
export function useVoiceCall(
  purpose: CallPurpose,
  personaId?: string,
  scenario?: string,
  practise?: string,
): VoiceCall {
  const createEngine = useVoiceEngineFactory();
  const [status, setStatus] = useState<VoiceCall['status']>('starting');
  const [problem, setProblem] = useState<CallProblem | null>(null);
  const [started, setStarted] = useState<StartedCall | null>(null);
  const [conversation, dispatch] = useReducer(conversationReducer, INITIAL_CONVERSATION);
  const [muted, setMuted] = useState(false);
  const engine = useRef<VoiceEngine | null>(null);
  const mouth = useSharedValue(0);
  const voice = useSharedValue(0);

  useEffect(() => {
    const call = createEngine(purpose, personaId, scenario, practise);
    engine.current = call;
    let current = true;
    const fail = (reason: CallProblem) => {
      if (!current) return;
      setProblem(reason);
      setStatus('failed');
    };
    const unsubscribe = call.subscribe((event) => {
      if (!current) return;
      if ((event as { type?: unknown } | null)?.type === 'connection.lost') {
        call.stop();
        fail('lost');
      } else {
        dispatch(event);
      }
    });
    call.start().then(
      (answer) => {
        if (!current) return;
        setStarted(answer);
        setStatus('live');
      },
      (error: unknown) => fail(error instanceof VoiceError ? error.code : 'unknown'),
    );
    return () => {
      current = false;
      unsubscribe();
      call.stop();
    };
  }, [createEngine, purpose, personaId, scenario, practise]);

  // The lips and the listening ring follow the voice levels while the call is live.
  const speaking = conversation.phase === 'speaking';
  useEffect(() => {
    if (status !== 'live') return;
    const follow = (target: SharedValue<number>, level: number) =>
      target.set(withTiming(level, { duration: motion.lipSync }));
    const timer = setInterval(() => {
      void engine.current?.levels().then((levels) => {
        follow(mouth, speaking ? mouthOpenness(levels.persona) : 0);
        follow(voice, muted ? 0 : mouthOpenness(levels.learner));
      });
    }, LEVEL_INTERVAL_MS);
    return () => {
      clearInterval(timer);
      follow(mouth, 0);
      follow(voice, 0);
    };
  }, [status, speaking, muted, mouth, voice]);

  const toggleMute = useCallback(() => {
    setMuted((current) => {
      engine.current?.setMuted(!current);
      return !current;
    });
  }, []);

  const say = useCallback((text: string) => engine.current?.say(text), []);
  const help = useCallback((kind: HelpKind) => engine.current?.help(kind), []);
  const stop = useCallback(() => engine.current?.stop(), []);

  return {
    status,
    problem,
    callId: started?.callId ?? null,
    maxSeconds: started?.maxSeconds ?? null,
    plan: started?.plan ?? null,
    conversation,
    muted,
    toggleMute,
    say,
    help,
    stop,
    mouth,
    voice,
  };
}
