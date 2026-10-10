import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/components/empty-state';
import { Reveal } from '@/components/motion';
import { TabHeader, TabScreen } from '@/components/tab-screen';

/**
 * 5.7 Learn: where cards, the grammar map and the phrasebook will live (spec §14.1). None of
 * them is built yet, so the screen says what is coming and shows nothing made up.
 */
export function LearnScreen() {
  const { t } = useTranslation();
  return (
    <TabScreen>
      <Reveal>
        <TabHeader title={t('learn.title')} />
      </Reveal>
      <EmptyState icon="book" title={t('learn.emptyTitle')} body={t('learn.emptyBody')} />
    </TabScreen>
  );
}
