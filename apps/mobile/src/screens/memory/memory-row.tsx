import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import type { Memory } from '@konvami/api-client';
import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import { formatDate } from '@/lib/format';
import { useTheme } from '@/theme';

/**
 * One thing the partners know: the note as it was written down and, for something on a day,
 * that day. The whole row opens the memory to reword or forget it.
 */
export function MemoryRow({ memory, onPress }: { memory: Memory; onPress: () => void }) {
  const { t, i18n } = useTranslation();
  const { color } = useTheme();
  const date = memory.day ? formatDate(i18n.language, memory.day) : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={date ? t('memory.datedLabel', { date, text: memory.text }) : memory.text}
      onPress={onPress}
      className="min-h-button flex-row items-center gap-3 p-3.5 active:opacity-pressed"
    >
      <View className="flex-1 gap-0.5">
        {date ? (
          <Text variant="captionStrong" tone="primary">
            {date}
          </Text>
        ) : null}
        <Text variant="callout">{memory.text}</Text>
      </View>
      <Icon name="chevronRight" color={color.fgSubtle} size={size.iconMd} />
    </Pressable>
  );
}
