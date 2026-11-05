import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ListGroup, ListRow } from '@/components/list';
import { ROUTES } from '@/lib/routes';

/**
 * The way to 5.20 Then vs Now (spec §6.15). It is always offered: the screen itself says what a
 * learner without recordings, or without two conversations far enough apart, has to do first.
 */
export function ThenVsNowCard() {
  const { t } = useTranslation();
  return (
    <ListGroup>
      <ListRow
        icon="volume"
        title={t('progress.thenVsNow.title')}
        detail={t('progress.thenVsNow.detail')}
        onPress={() => router.push(ROUTES.thenVsNow)}
      />
    </ListGroup>
  );
}
