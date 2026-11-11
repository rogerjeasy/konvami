import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/auth';
import { ChoiceChip } from '@/components/choice-chip';
import { ChoiceGroup } from '@/components/choice-group';
import { TextButton } from '@/components/text-button';
import { TextField } from '@/components/text-field';
import { Text } from '@/components/text';
import type { LibraryQuery } from '@/practice/library-store';
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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<LibraryQuery['mode']>();
  const [partner, setPartner] = useState<string>();
  const [from, setFrom] = useState('');
  const [through, setThrough] = useState('');
  const [dateError, setDateError] = useState(false);
  const [searched, setSearched] = useState(false);
  const signedIn = status === 'signedIn';

  useEffect(() => {
    if (signedIn) void store.load();
  }, [signedIn, store]);

  if (!signedIn) return <Redirect href={ROUTES.welcome} />;
  const now = new Date(clock.now());
  const conversations = library.items;
  const partners = [
    ...new Map(
      conversations.filter((c) => c.partner).map((c) => [c.partner!.id, c.partner!]),
    ).values(),
  ];
  function search() {
    const valid = (value: string) =>
      !value ||
      (/^\d{4}-\d{2}-\d{2}$/.test(value) &&
        !Number.isNaN(Date.parse(value)) &&
        new Date(value).toISOString().slice(0, 10) === value);
    if (!valid(from) || !valid(through) || (from && through && from > through)) {
      setDateError(true);
      return;
    }
    setDateError(false);
    setSearched(true);
    void store.search({
      q: query.trim(),
      mode,
      partner,
      after: from ? `${from}T00:00:00Z` : undefined,
      through: through ? `${through}T23:59:59.999Z` : undefined,
    });
  }
  return (
    <TabScreen onRefresh={library.phase === 'ready' ? () => void store.refresh() : undefined}>
      <Reveal>
        <TabHeader title={t('library.title')} body={t('library.body')} />
      </Reveal>
      <Reveal delay={staggerDelay(1)}>
        <View className="w-full max-w-content gap-3 self-center">
          <TextField
            label={t('offlineLibrary.search')}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={search}
          />
          <TextButton
            label={t('offlineLibrary.filters')}
            onPress={() => setFiltersOpen(!filtersOpen)}
          />
          {filtersOpen ? (
            <>
              <ChoiceGroup label={t('offlineLibrary.mode')} chips>
                {([undefined, 'free', 'role_play', 'review'] as const).map((value) => (
                  <ChoiceChip
                    key={value ?? 'all'}
                    label={t(`offlineLibrary.${value ?? 'all'}`)}
                    selected={mode === value}
                    onPress={() => setMode(value)}
                  />
                ))}
              </ChoiceGroup>
              {partners.length ? (
                <ChoiceGroup label={t('offlineLibrary.partner')} chips>
                  <ChoiceChip
                    label={t('offlineLibrary.all')}
                    selected={!partner}
                    onPress={() => setPartner(undefined)}
                  />
                  {partners.map((p) => (
                    <ChoiceChip
                      key={p.id}
                      label={p.name}
                      selected={partner === p.id}
                      onPress={() => setPartner(p.id)}
                    />
                  ))}
                </ChoiceGroup>
              ) : null}
              <TextField label={t('offlineLibrary.from')} value={from} onChangeText={setFrom} />
              <TextField
                label={t('offlineLibrary.through')}
                value={through}
                onChangeText={setThrough}
                error={dateError ? t('offlineLibrary.invalidDate') : undefined}
              />
            </>
          ) : null}
          <Button variant="secondary" label={t('offlineLibrary.searchButton')} onPress={search} />
        </View>
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
      ) : conversations.length === 0 && searched ? (
        <Text tone="muted">{t('offlineLibrary.noMatches')}</Text>
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
