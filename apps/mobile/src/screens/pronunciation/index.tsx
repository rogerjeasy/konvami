import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/auth';
import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { ListGroup, ListRow } from '@/components/list';
import { LoadState } from '@/components/load-state';
import { Reveal } from '@/components/motion';
import { Section } from '@/components/section';
import { HeaderButton } from '@/components/step-header';
import { StepLayout } from '@/components/step-layout';
import { Text } from '@/components/text';
import { staggerDelay } from '@/lib/motion';
import { backOr } from '@/lib/navigation';
import { pronunciationSoundRoute, ROUTES } from '@/lib/routes';
import { usePracticeServices, usePronunciation } from '@/practice/services';
import { DrillSheet } from './drill-sheet';
import type { LabDrill } from './lab';

/**
 * 5.22 Pronunciation lab (spec §6.14, basic): the sounds the language is known for being hard,
 * each with a page to listen, pick and say, and the learner's own problem words, which are the
 * words they were asked to say and were not heard as asked. Reached from Learn and Talk. What it
 * tells is an approximation (words compared, no sound scores), and the screen says so.
 */
export function PronunciationLabScreen() {
  const { t } = useTranslation();
  const { status } = useSession();
  const { pronunciation: store } = usePracticeServices();
  const lab = usePronunciation();
  const [drill, setDrill] = useState<LabDrill | null>(null);
  const signedIn = status === 'signedIn';

  useEffect(() => {
    if (signedIn) void store.load();
  }, [signedIn, store]);

  if (!signedIn) return <Redirect href={ROUTES.welcome} />;
  const data = lab.phase === 'ready' ? lab.data : null;
  return (
    <StepLayout
      header={
        <View className="min-h-tap flex-row items-center">
          <HeaderButton
            icon="chevronLeft"
            label={t('common.back')}
            onPress={() => backOr(ROUTES.learn)}
          />
        </View>
      }
    >
      <Reveal>
        <View className="gap-1.5">
          <Text variant="title" accessibilityRole="header">
            {t('pronunciation.title')}
          </Text>
          <Text tone="muted">{t('pronunciation.body')}</Text>
        </View>
      </Reveal>
      {!data ? (
        <LoadState
          failed={lab.phase === 'failed'}
          loadingLabel={t('pronunciation.loading')}
          slowLabel={t('common.wakingUp')}
          failedLabel={t(lab.error === 'network' ? 'errors.network' : 'pronunciation.loadFailed')}
          retryLabel={t('common.retry')}
          onRetry={() => void store.reload()}
        />
      ) : data.sounds.length === 0 ? (
        <EmptyState
          icon="volume"
          title={t('pronunciation.emptyTitle')}
          body={t('pronunciation.emptyBody')}
        />
      ) : (
        <View className="gap-6">
          <Reveal delay={staggerDelay(1)}>
            <Card className="p-4">
              <Text variant="small" tone="muted">
                {t('pronunciation.approx')}
              </Text>
            </Card>
          </Reveal>
          {data.words.length > 0 ? (
            <Reveal delay={staggerDelay(2)}>
              <Section title={t('pronunciation.words.title')} count={data.words.length}>
                <View className="gap-2.5">
                  <Text variant="small" tone="muted">
                    {t('pronunciation.words.hint')}
                  </Text>
                  <ListGroup>
                    {data.words.map((word) => (
                      <ListRow
                        key={word.word}
                        icon="mic"
                        title={word.word}
                        detail={t('pronunciation.words.missed', { count: word.misses })}
                        onPress={() =>
                          setDrill({
                            kind: 'word',
                            soundId: null,
                            target: word.word,
                            listen: [word.word],
                          })
                        }
                      />
                    ))}
                  </ListGroup>
                </View>
              </Section>
            </Reveal>
          ) : null}
          <Reveal delay={staggerDelay(3)}>
            <Section title={t('pronunciation.sounds')}>
              <ListGroup>
                {data.sounds.map((sound) => (
                  <ListRow
                    key={sound.id}
                    icon="volume"
                    title={sound.title}
                    detail={
                      sound.tries > 0
                        ? t('pronunciation.progress', { right: sound.right, tries: sound.tries })
                        : t('pronunciation.notTried')
                    }
                    onPress={() => router.push(pronunciationSoundRoute(sound.id))}
                  />
                ))}
              </ListGroup>
            </Section>
          </Reveal>
        </View>
      )}
      <DrillSheet drill={drill} onClose={() => setDrill(null)} />
    </StepLayout>
  );
}
