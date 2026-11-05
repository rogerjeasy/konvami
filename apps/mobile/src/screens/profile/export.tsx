import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { DataExport } from '@konvami/api-client';
import { apiErrorCode, apiErrorKey } from '@/api/messages';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { Text } from '@/components/text';
import { openFile } from '@/lib/external';
import { wholeMinutes } from '@/lib/format';
import { commitFeedback, successFeedback } from '@/lib/haptics';
import { staggerDelay } from '@/lib/motion';
import { useProfileServices } from '@/profile/services';
import { ProfilePage } from './page';

/** The message for a copy that could not be made. */
function failureKey(code: string) {
  return code === 'export_limit' ? 'profile.export.limit' : apiErrorKey(code);
}

/**
 * 6.19 Export my data (spec §6.21.3; GDPR art. 15 and 20): a copy of everything Konvami keeps
 * about the learner, as one file. It is made when asked for (at most three a day), read through
 * a link that works for an hour, and deleted by the server after a day.
 */
export function ExportScreen() {
  const { t } = useTranslation();
  const { exportData } = useProfileServices();
  const [working, setWorking] = useState(false);
  const [copy, setCopy] = useState<DataExport | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  async function prepare() {
    commitFeedback();
    setWorking(true);
    setFailure(null);
    try {
      setCopy(await exportData());
      successFeedback();
    } catch (error) {
      setFailure(t(failureKey(apiErrorCode(error))));
    } finally {
      setWorking(false);
    }
  }

  return (
    <ProfilePage
      title={t('profile.export.title')}
      body={t('profile.export.body')}
      actions={
        copy ? (
          <Button label={t('profile.export.open')} onPress={() => openFile(copy.url)} />
        ) : (
          <Button
            label={working ? t('profile.export.preparing') : t('profile.export.prepare')}
            loading={working}
            onPress={() => void prepare()}
          />
        )
      }
    >
      <Reveal delay={staggerDelay(1)}>
        <Card className="gap-2 p-3.5">
          <Text variant="labelMedium">{t('profile.export.includesTitle')}</Text>
          <Text variant="small" tone="muted">
            {t('profile.export.includes')}
          </Text>
        </Card>
      </Reveal>
      <View accessibilityLiveRegion="polite" className="gap-3">
        {copy ? (
          <NoticeBox icon="check" tone="primary" title={t('profile.export.ready')}>
            {t('profile.export.readyBody', { minutes: wholeMinutes(copy.expiresInSeconds) })}
          </NoticeBox>
        ) : null}
        {failure ? (
          <NoticeBox icon="alert" tone="danger">
            {failure}
          </NoticeBox>
        ) : null}
      </View>
    </ProfilePage>
  );
}
