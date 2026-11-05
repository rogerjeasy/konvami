import { useEffect, useState } from 'react';
import type { AvatarExpression, AvatarGesture } from '@/components/avatar/look';
import type { ConversationState } from './conversation';

// How long a face the partner asked for stays before the portrait returns to rest.
export const EXPRESSION_HOLD_MS = 6000;
// How long the thoughtful "hmm" of a correction lasts: a glance, not a mood.
export const HMM_HOLD_MS = 2200;

export interface AvatarFace {
  expression: AvatarExpression;
  gesture: AvatarGesture;
}

const REST: AvatarFace = { expression: 'neutral', gesture: 'none' };
const HMM: AvatarFace = { expression: 'neutral', gesture: 'hmm' };

/**
 * The face of the partner's portrait during a call (spec §6.20.1): the expression it asked for
 * with `set_expression` for a few seconds, and a thoughtful "hmm" when a live correction for the
 * learner comes in (spec §6.20.1 "teaching gestures"). A face the partner asked for wins over the
 * "hmm", so a thumbs-up is never cut short by a correction.
 *
 * A face is shown while it is newer than the last one that ran out, and a timer only records that
 * one has run out: the state is derived from the conversation, never set from an effect.
 */
export function useAvatarFace(conversation: ConversationState): AvatarFace {
  const asked = conversation.expression;
  const [lapsedRequest, setLapsedRequest] = useState(0);
  const requestSeq = asked?.seq ?? 0;
  useEffect(() => {
    if (requestSeq === 0) return;
    const timer = setTimeout(() => setLapsedRequest(requestSeq), EXPRESSION_HOLD_MS);
    return () => clearTimeout(timer);
  }, [requestSeq]);

  // Corrections already there when the screen opens (or have lapsed) do not make the face.
  const corrections = conversation.corrections.length;
  const [lapsedCorrections, setLapsedCorrections] = useState(corrections);
  useEffect(() => {
    if (corrections <= lapsedCorrections) return;
    const timer = setTimeout(() => setLapsedCorrections(corrections), HMM_HOLD_MS);
    return () => clearTimeout(timer);
  }, [corrections, lapsedCorrections]);

  if (asked && asked.seq !== lapsedRequest) {
    return { expression: asked.expression, gesture: asked.gesture };
  }
  return corrections > lapsedCorrections ? HMM : REST;
}
