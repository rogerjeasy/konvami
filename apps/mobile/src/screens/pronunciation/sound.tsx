import { useState } from 'react';
import { View } from 'react-native';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { PronunciationSoundDetail } from '@konvami/api-client';
import { useSession } from '@/auth';
import { Card } from '@/components/card';
import { ListGroup, ListRow } from '@/components/list';
import { LoadState } from '@/components/load-state';
import { Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { Section } from '@/components/section';
import { HeaderButton } from '@/components/step-header';
import { StepLayout } from '@/components/step-layout';
import { Text } from '@/components/text';
import { staggerDelay } from '@/lib/motion';
import { backOr } from '@/lib/navigation';
import { ROUTES } from '@/lib/routes';
import { DrillSheet } from './drill-sheet';
import { useSoundDetail, type LabDrill } from './lab';
import { ListenPick } from './listen-pick';

/** The things to say on a sound's page, one row each; pressing a row opens it to say. */
function SayList({
  items,
  onSay,
}: {
  items: readonly { key: string; title: string; drill: LabDrill }[];
  onSay: (drill: LabDrill) => void;
}) {
  return (
    <ListGroup>
      {items.map((item) => (
        <ListRow key={item.key} icon="mic" title={item.title} onPress={() => onSay(item.drill)} />
      ))}
    </ListGroup>
  );
}

function SoundBody({
  detail,
  onSay,
}: {
  detail: PronunciationSoundDetail;
  onSay: (drill: LabDrill) => void;
}) {
  const { t } = useTranslation();
  const { sound } = detail;
  const soundId = sound.id;
  return (
    <View className="gap-6">
      <Reveal>
        <View className="gap-3">
          <Text variant="title" accessibilityRole="header">
            {sound.title}
          </Text>
          <Card className="p-4">
            <Text>{sound.tip}</Text>
          </Card>
        </View>
      </Reveal>
      {sound.listening && detail.pairs.length > 0 ? (
        <Reveal delay={staggerDelay(1)}>
          <Section title={t('pronunciation.sound.listen')}>
            <ListenPick soundId={soundId} pairs={detail.pairs} />
          </Section>
        </Reveal>
      ) : null}
      {detail.pairs.length > 0 ? (
        <Reveal delay={staggerDelay(2)}>
          <Section title={t('pronunciation.sound.pairs')}>
            <SayList
              onSay={onSay}
              items={detail.pairs.map((pair) => ({
                key: `${pair.first} ${pair.second}`,
                title: `${pair.first} · ${pair.second}`,
                drill: {
                  kind: 'word',
                  soundId,
                  target: `${pair.first} ${pair.second}`,
                  listen: [pair.first, pair.second],
                },
              }))}
            />
          </Section>
        </Reveal>
      ) : null}
      {detail.words.length > 0 ? (
        <Reveal delay={staggerDelay(3)}>
          <Section title={t('pronunciation.sound.words')}>
            <SayList
              onSay={onSay}
              items={detail.words.map((word) => ({
                key: word,
                title: word,
                drill: { kind: 'word', soundId, target: word, listen: [word] },
              }))}
            />
          </Section>
        </Reveal>
      ) : null}
      {detail.sentences.length > 0 ? (
        <Reveal delay={staggerDelay(4)}>
          <Section title={t('pronunciation.sound.sentences')}>
            <SayList
              onSay={onSay}
              items={detail.sentences.map((sentence) => ({
                key: sentence,
                title: sentence,
                drill: { kind: 'shadow', soundId, target: sentence, listen: [sentence] },
              }))}
            />
          </Section>
        </Reveal>
      ) : null}
      <Text variant="caption" tone="subtle">
        {t('pronunciation.approx')}
      </Text>
    </View>
  );
}

/**
 * 5.22 One sound of the pronunciation lab (spec §6.14): what it is and how to make it, a game of
 * hearing which word of a pair was played, the pairs to say, words, and sentences to shadow.
 */
export function PronunciationSoundScreen() {
  const { t } = useTranslation();
  const { status } = useSession();
  const { sound: id = '' } = useLocalSearchParams<{ sound: string }>();
  const reading = useSoundDetail(id);
  const [drill, setDrill] = useState<LabDrill | null>(null);

  if (status !== 'signedIn') return <Redirect href={ROUTES.welcome} />;
  return (
    <StepLayout
      header={
        <View className="min-h-tap flex-row items-center">
          <HeaderButton
            icon="chevronLeft"
            label={t('common.back')}
            onPress={() => backOr(ROUTES.pronunciation)}
          />
        </View>
      }
    >
      {reading.phase === 'failed' && reading.code === 'not_found' ? (
        <NoticeBox icon="info">{t('pronunciation.sound.notFound')}</NoticeBox>
      ) : reading.phase !== 'ready' ? (
        <LoadState
          failed={reading.phase === 'failed'}
          loadingLabel={t('pronunciation.sound.loading')}
          slowLabel={t('common.wakingUp')}
          failedLabel={t(
            reading.phase === 'failed' && reading.code === 'network'
              ? 'errors.network'
              : 'pronunciation.sound.loadFailed',
          )}
          retryLabel={t('common.retry')}
          onRetry={reading.retry}
        />
      ) : (
        <SoundBody detail={reading.detail} onSay={setDrill} />
      )}
      <DrillSheet drill={drill} onClose={() => setDrill(null)} />
    </StepLayout>
  );
}
