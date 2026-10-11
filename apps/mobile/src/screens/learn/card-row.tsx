import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import type { Card } from '@konvami/api-client';
import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import { useTheme } from '@/theme';

/** One card in the deck: its two sides and when it is due. The whole row opens the card. */
export function CardRow({ card, due, onPress }: { card: Card; due: string; onPress: () => void }) {
  const { t } = useTranslation();
  const { color } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('learn.cards.rowLabel', { front: card.front, back: card.back, due })}
      onPress={onPress}
      className="min-h-button flex-row items-center gap-3 p-3.5 active:opacity-pressed"
    >
      <View className="flex-1 gap-0.5">
        <Text variant="label">{card.front}</Text>
        <Text variant="small" tone="muted">
          {card.back}
        </Text>
      </View>
      <Text variant="caption" tone="subtle" className="shrink-0">
        {due}
      </Text>
      <Icon name="chevronRight" color={color.fgSubtle} size={size.iconMd} />
    </Pressable>
  );
}
