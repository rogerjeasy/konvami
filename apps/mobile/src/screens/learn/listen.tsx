import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { PlayButton } from '@/components/play-button';
import { Text } from '@/components/text';
import { useCardSound } from './use-card-sound';

/** Plays the card: a word with its sentence, a correction as it is right. */
export function Listen({ cardId }: { cardId: string }) {
  const { t } = useTranslation();
  const { state, toggle } = useCardSound(cardId);
  return (
    <View className="flex-row items-center gap-3">
      <PlayButton
        label={t(state === 'playing' ? 'learn.card.stopListening' : 'learn.card.listen')}
        state={state}
        onPress={toggle}
      />
      <Text variant="small" tone="muted">
        {t('learn.card.listenHint')}
      </Text>
    </View>
  );
}
