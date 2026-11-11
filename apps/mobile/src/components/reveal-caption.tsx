import { useState } from 'react';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';

/** Concealing the text also keeps screen readers from accidentally revealing the answer. */
export function RevealCaption({ text, hiddenLabel }: { text: string; hiddenLabel: string }) {
  const [revealed, setRevealed] = useState(false);
  return revealed ? (
    <Text variant="emphasis" className="text-center">
      {text}
    </Text>
  ) : (
    <TextButton label={hiddenLabel} onPress={() => setRevealed(true)} />
  );
}
