import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { size } from '@konvami/design-tokens';
import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import { useTheme } from '@/theme';

/**
 * One question of the FAQ: the question is the button, the answer opens under it. The row grows
 * with its text (a question can take three lines in German on a small phone).
 */
export function FaqItem({ question, answer }: { question: string; answer: string }) {
  const { color } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={question}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((shown) => !shown)}
        className="min-h-button flex-row items-center gap-3 p-3.5 active:opacity-pressed"
      >
        <Text variant="label" className="flex-1">
          {question}
        </Text>
        <View aria-hidden>
          <Icon
            name={open ? 'chevronDown' : 'chevronRight'}
            color={color.fgSubtle}
            size={size.iconMd}
          />
        </View>
      </Pressable>
      {open ? (
        <View className="px-3.5 pb-3.5">
          <Text tone="muted">{answer}</Text>
        </View>
      ) : null}
    </View>
  );
}
