import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/components/empty-state';
import { Reveal } from '@/components/motion';
import { TabHeader, TabScreen } from '@/components/tab-screen';

/**
 * 5.8 Progress: where the level per skill over time, the minutes and the milestones will be
 * charted (spec §6.15). Until there is enough practice to chart, and the charts to show it, the
 * screen says so; this week and the streak are on Today.
 */
export function ProgressScreen() {
  const { t } = useTranslation();
  return (
    <TabScreen>
      <Reveal>
        <TabHeader title={t('progress.title')} />
      </Reveal>
      <EmptyState icon="barChart" title={t('progress.emptyTitle')} body={t('progress.emptyBody')} />
    </TabScreen>
  );
}
