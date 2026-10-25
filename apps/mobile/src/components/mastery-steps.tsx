import { View } from 'react-native';
import { size } from '@konvami/design-tokens';
import type { GrammarMastery } from '@konvami/api-client';

/** The steps after "not started", in order: how many are filled says how far a topic is. */
const STEPS: readonly GrammarMastery[] = ['introduced', 'practising', 'mostly_correct', 'mastered'];

/**
 * How far a grammar topic is, as four short bars that fill one by one (spec §6.8: not started →
 * introduced → practising → mostly correct → mastered). Decorative: the text beside it says the
 * same, so a screen reader skips it.
 */
export function MasterySteps({ mastery }: { mastery: GrammarMastery }) {
  const reached = STEPS.indexOf(mastery) + 1;
  const done = mastery === 'mastered';
  return (
    <View aria-hidden className="flex-row gap-1" style={{ pointerEvents: 'none' }}>
      {STEPS.map((step, i) => (
        <View
          key={step}
          style={{ width: size.masteryStep, height: size.meterHeight }}
          className={`rounded-pill ${
            i < reached ? (done ? 'bg-success' : 'bg-primary') : 'bg-track'
          }`}
        />
      ))}
    </View>
  );
}
