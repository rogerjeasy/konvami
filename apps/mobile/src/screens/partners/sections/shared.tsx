import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { PersonaDraft } from '@konvami/api-client';
import { Reveal } from '@/components/motion';
import { Text } from '@/components/text';
import type { DraftProblem } from '@/profile/persona-draft';

/** What every part of Persona Studio is given: the working copy and the way to change it. */
export interface SectionProps {
  draft: PersonaDraft;
  change: (changes: Partial<PersonaDraft>) => void;
  /** What the draft still needs, once the learner has tried to move on. */
  problems: readonly DraftProblem[];
}

/** The question a part of the studio answers, with a line under it. */
export function SectionTitle({ title, body }: { title: string; body: string }) {
  return (
    <Reveal>
      <View className="gap-2.5">
        <Text variant="title" accessibilityRole="header">
          {title}
        </Text>
        <Text tone="muted">{body}</Text>
      </View>
    </Reveal>
  );
}

/** A named block inside a part: a small label and what belongs under it. */
export function Block({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View className="gap-2">
      <Text variant="fieldLabel">{label}</Text>
      {children}
    </View>
  );
}
