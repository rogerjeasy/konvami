import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { Tile } from '@/components/tile';
import { useTheme } from '@/theme';
import { CardFan } from './card-fan';

/**
 * The top of the Learn tab: words are pink (v4). How many cards are waiting, large, and the
 * buttons that start the review (turning the cards over, answering them out loud, or in a
 * conversation with a partner) or, when none is, that the learner is caught up and when the
 * next card comes back.
 */
export function ReviewCard({
  due,
  next,
  onReview,
  onReviewAloud,
  onConverse,
}: {
  due: number;
  /** When the next card comes back, in words ("tomorrow"); null when no card is waiting. */
  next: string | null;
  onReview: () => void;
  /** Starts a review whose cards are answered out loud (voice review). */
  onReviewAloud: () => void;
  /** Starts a conversation built around the due words; null while no partner is known. */
  onConverse: (() => void) | null;
}) {
  const { t } = useTranslation();
  const { color } = useTheme();
  if (due > 0) {
    return (
      <Tile color="pink" className="gap-4">
        <CardFan />
        <View className="gap-1 pr-24">
          <Text variant="numeral" tone="onPink" aria-hidden>
            {due}
          </Text>
          <Text variant="section" tone="onPink" accessibilityRole="header">
            {t('learn.review.due', { count: due })}
          </Text>
          <Text variant="callout" tone="onPink">
            {t('learn.review.body')}
          </Text>
        </View>
        <View className="gap-2.5">
          <Button
            label={t('learn.review.start')}
            leading={<Icon name="play" color={color.onPrimary} size={size.icon} />}
            onPress={onReview}
          />
          <Button
            variant="secondary"
            label={t('learn.review.aloud')}
            leading={<Icon name="mic" color={color.fg} size={size.iconMd} />}
            onPress={onReviewAloud}
          />
          {onConverse ? (
            <TextButton tone="primary" label={t('learn.review.converse')} onPress={onConverse} />
          ) : null}
        </View>
      </Tile>
    );
  }
  return (
    <Card className="flex-row items-center gap-3 p-4">
      <View
        aria-hidden
        style={{ width: size.avatarSm, height: size.avatarSm }}
        className="items-center justify-center rounded-pill bg-lime"
      >
        <Icon name="check" color={color.onLime} size={size.iconMd} strokeWidth={2.4} />
      </View>
      <View className="flex-1 gap-0.5">
        <Text variant="heading">{t('learn.review.none')}</Text>
        {next ? (
          <Text variant="small" tone="muted">
            {t('learn.review.next', { when: next })}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}
