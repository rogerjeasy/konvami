import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/auth';
import { Card } from '@/components/card';
import { ListGroup } from '@/components/list';
import { LoadState } from '@/components/load-state';
import { Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { Section } from '@/components/section';
import { Switch } from '@/components/switch';
import { Text } from '@/components/text';
import { calendarDateOf, toIsoDate } from '@/lib/dates';
import { staggerDelay } from '@/lib/motion';
import { memoryRoute } from '@/lib/routes';
import { usePracticeServices } from '@/practice/services';
import { useMemories, useProfileServices } from '@/profile/services';
import { ProfilePage } from '@/screens/profile/page';
import { groupMemories, type MemoryGroup } from './groups';
import { MemoryRow } from './memory-row';
import { OffLimitsTopics } from './topics';

// The switch and the topics come before the groups in the order the screen reveals itself.
const PARTS_BEFORE_GROUPS = 3;

function groupTitle(t: TFunction, group: MemoryGroup): string {
  if (group.kind !== 'partner') return t(`memory.groups.${group.kind}`);
  return group.partnerName
    ? t('memory.groups.partner', { name: group.partnerName })
    : t('memory.groups.formerPartner');
}

/**
 * 6.10 What my partners know (spec §6.11 "What my buddy knows about me"): whether partners
 * remember at all, the topics they leave alone, and every note they keep about the learner,
 * each one a way in to reword or forget it. Nothing is listed that the server does not hold.
 */
export function MemoryScreen() {
  const { t } = useTranslation();
  const { status } = useSession();
  const { memory: store } = useProfileServices();
  const { clock } = usePracticeServices();
  const state = useMemories();
  // What the switch shows while the choice is on its way to the server.
  const [choosing, setChoosing] = useState<boolean | null>(null);
  const [failed, setFailed] = useState(false);
  const signedIn = status === 'signedIn';

  useEffect(() => {
    if (signedIn) void store.load();
  }, [signedIn, store]);

  // Coming back: a conversation may have added something, or a memory was changed or forgotten.
  useFocusEffect(
    useCallback(() => {
      if (signedIn) void store.refresh();
    }, [signedIn, store]),
  );

  async function remember(on: boolean) {
    setChoosing(on);
    setFailed(false);
    try {
      await store.configure({ enabled: on });
    } catch {
      // The switch shows what the account holds, so it goes back.
      setFailed(true);
    } finally {
      setChoosing(null);
    }
  }

  const book = state.phase === 'ready' ? state.data : null;
  const enabled = choosing ?? book?.enabled ?? true;
  const groups = book
    ? groupMemories(book.memories, toIsoDate(calendarDateOf(new Date(clock.now()))))
    : [];
  return (
    <ProfilePage title={t('memory.title')} body={t('memory.body')}>
      {!book ? (
        <LoadState
          failed={state.phase === 'failed'}
          loadingLabel={t('memory.loading')}
          slowLabel={t('common.wakingUp')}
          failedLabel={t(state.error === 'network' ? 'errors.network' : 'memory.loadFailed')}
          retryLabel={t('common.retry')}
          onRetry={() => void store.reload()}
        />
      ) : (
        <>
          <Reveal delay={staggerDelay(1)}>
            <View className="gap-3">
              <Card className="flex-row items-center gap-3 p-3.5">
                <View className="flex-1 gap-1">
                  <Text variant="labelMedium">{t('memory.switch.label')}</Text>
                  <Text variant="small" tone="muted">
                    {t(enabled ? 'memory.switch.on' : 'memory.switch.off')}
                  </Text>
                </View>
                <Switch
                  label={t('memory.switch.label')}
                  value={enabled}
                  locked={choosing !== null}
                  onValueChange={(on) => void remember(on)}
                />
              </Card>
              {failed ? (
                <NoticeBox icon="alert" tone="danger">
                  {t('memory.saveFailed')}
                </NoticeBox>
              ) : null}
            </View>
          </Reveal>
          <Reveal delay={staggerDelay(2)}>
            <OffLimitsTopics
              topics={book.avoidTopics}
              onChange={(topics) => store.configure({ avoidTopics: topics })}
            />
          </Reveal>
          {groups.length === 0 ? (
            <Reveal delay={staggerDelay(PARTS_BEFORE_GROUPS)}>
              <NoticeBox icon="info" title={t('memory.emptyTitle')}>
                {t(book.enabled ? 'memory.emptyBody' : 'memory.emptyOff')}
              </NoticeBox>
            </Reveal>
          ) : (
            groups.map((group, i) => (
              <Reveal key={group.key} delay={staggerDelay(PARTS_BEFORE_GROUPS + i)}>
                <Section title={groupTitle(t, group)} count={group.memories.length}>
                  <ListGroup>
                    {group.memories.map((memory) => (
                      <MemoryRow
                        key={memory.id}
                        memory={memory}
                        onPress={() => router.push(memoryRoute(memory.id))}
                      />
                    ))}
                  </ListGroup>
                </Section>
              </Reveal>
            ))
          )}
        </>
      )}
    </ProfilePage>
  );
}
