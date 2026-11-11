import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { NoticeBox } from '@/components/notice-box';
import { TextButton } from '@/components/text-button';
import { usePracticeServices } from '@/practice/services';

/** Ratings remain visibly pending until the server acknowledges them. */
export function OfflineReviewStatus({ revision }: { revision: unknown }) {
  const { offline } = usePracticeServices();
  const { t } = useTranslation();
  const [pending, setPending] = useState(0);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let current = true;
    void offline
      ?.pendingReviews()
      .then((value) => {
        if (current) setPending(value);
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [offline, revision]);
  if (!offline || !pending) return null;
  return (
    <View className="gap-1">
      <NoticeBox icon="info">{t('offlineLibrary.pending', { count: pending })}</NoticeBox>
      {failed ? <NoticeBox icon="info">{t('errors.network')}</NoticeBox> : null}
      <TextButton
        label={t('offlineLibrary.sync')}
        disabled={busy}
        onPress={() => {
          setBusy(true);
          setFailed(false);
          void offline
            .syncReviews()
            .then(
              async () => setPending(await offline.pendingReviews()),
              () => setFailed(true),
            )
            .finally(() => setBusy(false));
        }}
      />
    </View>
  );
}
