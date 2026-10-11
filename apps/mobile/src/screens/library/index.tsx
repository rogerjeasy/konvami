import { useEffect } from 'react';
import { View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/auth';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ConversationRow } from '@/components/conversation-row';
import { EmptyState } from '@/components/empty-state';
import { LoadState } from '@/components/load-state';
import { Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { TabHeader, TabScreen } from '@/components/tab-screen';
import { staggerDelay } from '@/lib/motion';
import { conversationRoute, ROUTES } from '@/lib/routes';
import { useLibrary, usePracticeServices } from '@/practice/services';

/**
 * 5.5 Library: every conversation the learner has had, newest first, to read again (spec
 * §14.1). Recordings and search arrive with the audio library; this is the text of each one.
 */
export function LibraryScreen() {
  const { t } = useTranslation();
  const { status } = useSession();
  const { library: store, clock } = usePracticeServices();
  const library = useLibrary();
  const signedIn = status === 'signedIn';

  useEffect(() => {
    if (signedIn) void store.load();
  }, [signedIn, store]);

  if (!signedIn) return <Redirect href={ROUTES.welcome} />;
  const now = new Date(clock.now());
  const conversations = library.items;
  return (
    <TabScreen onRefresh={library.phase === 'ready' ? () => void store.refresh() : undefined}>
      <Reveal>
        <TabHeader title={t('library.title')} body={t('library.body')} />
      </Reveal>
      {library.phase !== 'ready' ? (
        <LoadState
          failed={library.phase === 'failed'}
          loadingLabel={t('library.loading')}
          slowLabel={t('common.wakingUp')}
          failedLabel={t(library.error === 'network' ? 'errors.network' : 'library.loadFailed')}
          retryLabel={t('common.retry')}
          onRetry={() => void store.reload()}
        />
      ) : conversations.length === 0 ? (
        <EmptyState
          icon="message"
          title={t('library.emptyTitle')}
          body={t('library.emptyBody')}
          action={
            <Button label={t('library.start')} onPress={() => router.navigate(ROUTES.talk)} />
          }
        />
      ) : (
        <Reveal delay={staggerDelay(1)}>
          <View className="w-full max-w-content gap-3 self-center">
            <Card className="px-3.5 py-1">
              {conversations.map((conversation, i) => (
                <View key={conversation.id} className={i > 0 ? 'border-t border-border' : ''}>
                  <ConversationRow
                    conversation={conversation}
                    now={now}
                    onPress={() => router.push(conversationRoute(conversation.id))}
                  />
                </View>
              ))}
            </Card>
            {library.moreFailed ? (
              <NoticeBox icon="alert" tone="danger">
                {t('library.moreFailed')}
              </NoticeBox>
            ) : null}
            {library.hasMore ? (
              <Button
                variant="secondary"
                label={t('library.more')}
                loading={library.loadingMore}
                onPress={() => void store.more()}
              />
            ) : null}
          </View>
        </Reveal>
      )}
    </TabScreen>
  );
}
