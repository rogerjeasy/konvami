import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import { useTheme } from '@/theme';

/**
 * The top of the Learn tab: how many cards are waiting and the button that starts the review
 * or, when none is, that the learner is caught up and when the next card comes back.
 */
export function ReviewCard({
  due,
  next,
  onReview,
}: {
  due: number;
  /** When the next card comes back, in words ("tomorrow"); null when no card is waiting. */
  next: string | null;
  onReview: () => void;
}) {
  const { t } = useTranslation();
  const { color } = useTheme();
  if (due > 0) {
    return (
      <Card className="gap-4 p-4">
        <View className="gap-1">
          <Text variant="heading" accessibilityRole="header">
            {t('learn.review.due', { count: due })}
          </Text>
          <Text variant="callout" tone="muted">
            {t('learn.review.body')}
          </Text>
        </View>
        <Button label={t('learn.review.start')} onPress={onReview} />
      </Card>
    );
  }
  return (
    <Card className="flex-row items-center gap-3 p-4">
      <View
        aria-hidden
        style={{ width: size.avatarSm, height: size.avatarSm }}
        className="items-center justify-center rounded-pill bg-success-soft"
      >
        <Icon name="check" color={color.success} size={size.iconMd} strokeWidth={2.4} />
      </View>
      <View className="flex-1 gap-0.5">
        <Text variant="label">{t('learn.review.none')}</Text>
        {next ? (
          <Text variant="small" tone="muted">
            {t('learn.review.next', { when: next })}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}
