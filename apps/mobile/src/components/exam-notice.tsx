import { useTranslation } from 'react-i18next';
import { Text } from '@/components/text';

/**
 * Under every page that names an exam (spec §6.13, docs/store/claims.md): Konvami is not
 * affiliated with or endorsed by the organisations behind the exams, their names are their
 * owners' trademarks, and every score is an estimate.
 */
export function ExamNotice() {
  const { t } = useTranslation();
  return (
    <Text variant="caption" tone="subtle">
      {t('exams.notAffiliated')}
    </Text>
  );
}
