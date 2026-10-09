import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { motion, size } from '@konvami/design-tokens';
import { FocusRing } from '@/components/focus-ring';
import { Loop } from '@/components/motion';
import { Text } from '@/components/text';
import { CODE_LENGTH, onlyDigits } from '@/lib/validation';

// The caret drawn in the next empty box (pt), and its blink.
const CARET = { width: 2, height: 24 } as const;
const BLINK = { from: { opacity: 1 }, to: { opacity: 0 } };

/**
 * A verification-code field drawn as one box per digit. Behind the boxes is a single real text
 * input, so typing, deleting, pasting and the system's "code from Mail/Messages" suggestion all
 * work as in any field. Non-digits are dropped.
 */
export function CodeInput({
  label,
  value,
  onChangeText,
  length = CODE_LENGTH,
  invalid = false,
  autoFocus = false,
  onSubmitEditing,
}: {
  label: string;
  value: string;
  onChangeText: (code: string) => void;
  length?: number;
  /** Draws the boxes in the error color (wrong or expired code). */
  invalid?: boolean;
  autoFocus?: boolean;
  onSubmitEditing?: () => void;
}) {
  const [focused, setFocused] = useState(false);
  // The box the next digit goes into; the last box once the code is complete.
  const activeIndex = Math.min(value.length, length - 1);

  return (
    <View>
      <View aria-hidden className="flex-row justify-between gap-2">
        {Array.from({ length }, (_, i) => {
          const digit = value[i];
          const active = focused && i === activeIndex;
          const look = invalid
            ? 'border-danger-border bg-danger-soft'
            : active
              ? 'border-primary bg-bg'
              : 'border-field-border bg-field';
          return (
            <FocusRing
              key={i}
              active={active && !invalid}
              // Boxes share the row evenly and never grow past their drawn width.
              className="flex-1"
            >
              <View
                style={{ minHeight: size.codeBoxHeight }}
                className={`items-center justify-center rounded-field border ${look}`}
              >
                {digit ? (
                  <Text variant="code">{digit}</Text>
                ) : active ? (
                  <Loop keyframes={BLINK} duration={motion.breathe / 4} alternate>
                    <View style={CARET} className="rounded-sm bg-primary" />
                  </Loop>
                ) : null}
              </View>
            </FocusRing>
          );
        })}
      </View>
      {/*
        The real input lies exactly over the boxes (it fills this component's own box, so it
        scales with it) and is invisible: a tap anywhere on the boxes focuses it.
      */}
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={(text) => onChangeText(onlyDigits(text, length))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onSubmitEditing={onSubmitEditing}
        autoFocus={autoFocus}
        keyboardType="number-pad"
        inputMode="numeric"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        // Longer than the code so a pasted "Code: 482 915" is not cut before its digits are found.
        maxLength={length * 4}
        caretHidden
        contextMenuHidden={false}
        className="absolute inset-0 text-transparent opacity-0 outline-none"
      />
    </View>
  );
}
