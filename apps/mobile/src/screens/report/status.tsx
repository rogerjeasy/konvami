import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { motion } from '@konvami/design-tokens';
import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { IconTile } from '@/components/icon-tile';
import { LoadState } from '@/components/load-state';
import { Loop } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import type { Keyframes } from '@/lib/motion';
import { ROUTES } from '@/lib/routes';
import type { ReportView } from '@/practice';

// How far the tile grows while the report is being written (a slow breath, not a spinner).
const BREATH_SCALE = 1.08;
const BREATHE: Keyframes = {
  from: { transform: [{ scale: 1 }] },
  to: { transform: [{ scale: BREATH_SCALE }] },
};

/** The report could not be read, or cannot be asked for, because of the conversation itself. */
const GONE = ['not_found'];
/** The server could not write the report, or it never arrived: asking again may work. */
const NOT_WRITTEN = ['failed', 'timeout'];

/**
 * What the report screen shows while there is no report to show: it is being loaded or
 * written, there is none yet, there cannot be one, or something went wrong. Each state says
 * what is the case in plain words and, where there is one, offers the next step.
 */
export function ReportStatus({
  view,
  onRequest,
  onReload,
}: {
  view: Exclude<ReportView, { phase: 'ready' }>;
  /** Asks the server to write the report. */
  onRequest: () => void;
  /** Reads the report again. */
  onReload: () => void;
}) {
  const { t } = useTranslation();

  if (view.phase === 'writing') {
    return (
      <EmptyState
        icon="file"
        lead={
          <Loop keyframes={BREATHE} duration={motion.breathe} alternate>
            <IconTile icon="edit" />
          </Loop>
        }
        title={t('report.writing.title')}
        body={t('report.writing.body')}
      />
    );
  }
  if (view.phase === 'none') {
    return (
      <EmptyState
        icon="file"
        title={t('report.none.title')}
        body={t('report.none.body')}
        action={<Button label={t('report.none.action')} onPress={onRequest} />}
      />
    );
  }
  if (view.phase === 'tooShort' || (view.phase === 'failed' && view.code === 'nothing_to_report')) {
    return (
      <EmptyState icon="mic" title={t('report.tooShort.title')} body={t('report.tooShort.body')} />
    );
  }
  if (view.phase === 'failed' && GONE.includes(view.code)) {
    return <NoticeBox icon="info">{t('report.notFound')}</NoticeBox>;
  }
  if (view.phase === 'failed' && NOT_WRITTEN.includes(view.code)) {
    return (
      <EmptyState
        icon="alert"
        title={t('report.failed.title')}
        body={t('report.failed.body')}
        action={<Button label={t('report.failed.action')} onPress={onRequest} />}
      />
    );
  }
  if (view.phase === 'failed' && view.code === 'consent_required') {
    return (
      <EmptyState
        icon="shield"
        title={t('report.consent.title')}
        body={t('report.consent.body')}
        action={
          <Button
            label={t('report.consent.action')}
            onPress={() => router.push(ROUTES.accountPrivacy)}
          />
        }
      />
    );
  }
  if (view.phase === 'failed' && view.code === 'unavailable') {
    return <NoticeBox icon="info">{t('report.unavailable')}</NoticeBox>;
  }
  return (
    <LoadState
      failed={view.phase === 'failed'}
      loadingLabel={t('report.loading')}
      slowLabel={t('common.wakingUp')}
      failedLabel={t(
        view.phase === 'failed' && view.code === 'network' ? 'errors.network' : 'report.loadFailed',
      )}
      retryLabel={t('common.retry')}
      onRetry={onReload}
    />
  );
}
