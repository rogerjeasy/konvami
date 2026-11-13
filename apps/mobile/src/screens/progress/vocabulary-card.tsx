import { useTranslation } from 'react-i18next';
import { Card } from '@/components/card';
import { Text } from '@/components/text';

/** Evidence of exposure and production, independent of the learner's saved-card choices. */
export function VocabularyCard({ active, passive }: { active: number; passive: number }) {
  const { t, i18n } = useTranslation();
  const format = new Intl.NumberFormat(i18n.language);
  return (
    <Card className="gap-2.5 p-4">
      <Text variant="overline" tone="subtle" accessibilityRole="header">
        {t('vocabulary.title')}
      </Text>
      <Text variant="label">
        {t('vocabulary.active', { count: active, formatted: format.format(active) })}
      </Text>
      <Text variant="label">
        {t('vocabulary.passive', { count: passive, formatted: format.format(passive) })}
      </Text>
      <Text variant="small" tone="muted">
        {t('vocabulary.evidence')}
      </Text>
    </Card>
  );
}
