import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { ProfileChangeEntry } from '@konvami/api-client';
import { apiErrorCode } from '@/api/messages';
import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { LoadState } from '@/components/load-state';
import { Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { useSession } from '@/auth';
import { formatDate } from '@/lib/format';
import { commitFeedback } from '@/lib/haptics';
import { staggerDelay } from '@/lib/motion';
import { useCatalog, useHome, usePracticeServices } from '@/practice/services';
import { describeSetting, settingName } from '@/profile/changes';
import { useProfileChanges, useProfileServices } from '@/profile/services';
import { ProfilePage } from './page';

// The calendar day of a stored moment ("2026-10-09T12:00:00Z" → "2026-10-09").
const DAY_LENGTH = 'YYYY-MM-DD'.length;

/** One setting a partner changed: what it was, what it is, and Undo while that still can be. */
function ChangeRow({
  entry,
  describe,
}: {
  entry: ProfileChangeEntry;
  describe: (field: string, value: unknown) => string;
}) {
  const { t, i18n } = useTranslation();
  const { changes } = useProfileServices();
  const [undoing, setUndoing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setting = settingName(entry.field, t);

  async function undo() {
    commitFeedback();
    setUndoing(true);
    setError(null);
    try {
      await changes.undo(entry.id);
    } catch (failure) {
      setError(
        t(
          apiErrorCode(failure) === 'superseded'
            ? 'profile.changes.superseded'
            : 'profile.changes.undoFailed',
        ),
      );
    } finally {
      setUndoing(false);
    }
  }

  return (
    <Card className="gap-1.5 p-4">
      <View className="flex-row items-start gap-3">
        <View className="flex-1 gap-1">
          <Text variant="label">{setting}</Text>
          <Text variant="small">
            {t('profile.changes.now', { value: describe(entry.field, entry.newValue) })}
          </Text>
          <Text variant="small" tone="muted">
            {t('profile.changes.was', { value: describe(entry.field, entry.oldValue) })}
          </Text>
          <Text variant="caption" tone="subtle">
            {formatDate(i18n.language, entry.changedAt.slice(0, DAY_LENGTH))}
          </Text>
        </View>
        {entry.undoable ? (
          <TextButton
            tone="primary"
            label={t('profile.changes.undo')}
            accessibilityLabel={t('profile.changes.undoLabel', { setting })}
            disabled={undoing}
            onPress={() => void undo()}
          />
        ) : null}
      </View>
      {error ? (
        <View accessibilityLiveRegion="polite">
          <NoticeBox icon="alert" tone="danger">
            {error}
          </NoticeBox>
        </View>
      ) : null}
    </Card>
  );
}

/**
 * 6.14 Changes made by voice (spec §6.1.3): the settings a partner changed because the learner
 * asked in a conversation, newest first. A change can be put back while nothing changed the same
 * setting since.
 */
export function ProfileChangesScreen() {
  const { t, i18n } = useTranslation();
  const { status } = useSession();
  const { changes } = useProfileServices();
  const state = useProfileChanges();
  const catalog = useCatalog();
  const { home: homeStore } = usePracticeServices();
  const home = useHome();
  const signedIn = status === 'signedIn';

  useEffect(() => {
    if (!signedIn) return;
    void changes.refresh();
    // The exams are those of the language being learned.
    void homeStore.load();
  }, [signedIn, changes, homeStore]);

  const language = home.phase === 'ready' ? home.data.language : null;
  const describe = (field: string, value: unknown) =>
    catalog.phase === 'ready'
      ? describeSetting(field, value, { t, locale: i18n.language, catalog: catalog.data, language })
      : '';

  return (
    <ProfilePage title={t('profile.changes.title')} body={t('profile.changes.body')}>
      {state.phase === 'ready' ? (
        state.data.changes.length === 0 ? (
          <EmptyState
            icon="message"
            title={t('profile.changes.title')}
            body={t('profile.changes.empty')}
          />
        ) : (
          <View className="gap-3">
            {state.data.changes.map((entry, i) => (
              <Reveal key={entry.id} delay={staggerDelay(i + 1)}>
                <ChangeRow entry={entry} describe={describe} />
              </Reveal>
            ))}
          </View>
        )
      ) : (
        <LoadState
          failed={state.phase === 'failed'}
          loadingLabel={t('common.loading')}
          slowLabel={t('common.wakingUp')}
          failedLabel={t(
            state.error === 'network' ? 'errors.network' : 'profile.changes.loadFailed',
          )}
          retryLabel={t('common.retry')}
          onRetry={() => void changes.reload()}
        />
      )}
    </ProfilePage>
  );
}
