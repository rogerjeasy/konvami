import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import type { StoryEpisode } from '@konvami/api-client';
import { useSession } from '@/auth';
import { Button } from '@/components/button';
import { CaptionWords } from '@/components/caption-words';
import { ChoiceChip } from '@/components/choice-chip';
import { ChoiceGroup, ToggleRow } from '@/components/choice-group';
import { Icon } from '@/components/icon';
import { LoadState } from '@/components/load-state';
import { Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { PageHero } from '@/components/page-hero';
import { RevealCaption } from '@/components/reveal-caption';
import { Section } from '@/components/section';
import { HeaderButton } from '@/components/step-header';
import { StepLayout } from '@/components/step-layout';
import { Text } from '@/components/text';
import { backOr } from '@/lib/navigation';
import { ROUTES } from '@/lib/routes';
import { useHome, usePracticeServices } from '@/practice/services';
import { CaptionLookupSheet, type CaptionSelection } from '@/screens/conversation/caption-lookup';
import { useTheme } from '@/theme';
import { StoryQuestion } from './question';
import { useEpisode, useStoryPlayer } from './use-episode';

// The speeds offered: slower for a first listen, a little faster once it is familiar.
const RATES = [0.75, 1, 1.25] as const;

/** One line of the episode: who says it, and its text, hidden until asked for or tapped. */
function Line({
  text,
  speaker,
  current,
  captions,
  onLookup,
}: {
  text: string;
  speaker: string;
  current: boolean;
  captions: boolean;
  onLookup: (word: string, caption: string) => void;
}) {
  const { t } = useTranslation();
  const words = (
    <CaptionWords
      caption={text}
      lookupLabel={(word) => t('captionLookup.lookup', { word })}
      onSelect={onLookup}
    />
  );
  return (
    <View
      className={`gap-1 rounded-card p-3 ${current ? 'bg-chip' : 'bg-transparent'}`}
      accessibilityState={{ selected: current }}
    >
      {speaker ? (
        <Text variant="labelSmall" tone="muted">
          {speaker}
        </Text>
      ) : null}
      {captions ? (
        words
      ) : (
        <RevealCaption text={text} hiddenLabel={t('stories.player.reveal')} content={words} />
      )}
    </View>
  );
}

function Player({
  episode,
  language,
  onListened,
}: {
  episode: StoryEpisode;
  language: string;
  onListened: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { color } = useTheme();
  const { lookupCaption, saveCaptionWord } = usePracticeServices();
  const [captions, setCaptions] = useState(false);
  const [ended, setEnded] = useState(episode.listened);
  const [selected, setSelected] = useState<CaptionSelection | null>(null);
  const player = useStoryPlayer(episode.lines, () => {
    setEnded(true);
    onListened();
  });
  const hasSound = episode.lines.some((line) => line.audioUrl);
  return (
    <View className="gap-5">
      <View className="gap-3">
        {hasSound ? (
          <Button
            label={t(
              player.playing
                ? 'stories.player.pause'
                : ended
                  ? 'stories.player.again'
                  : 'stories.player.play',
            )}
            leading={
              <Icon
                name={player.playing ? 'stop' : 'play'}
                color={color.onPrimary}
                size={size.iconMd}
              />
            }
            onPress={player.toggle}
          />
        ) : null}
        <ChoiceGroup label={t('stories.player.speed')} chips>
          {RATES.map((value) => (
            <ChoiceChip
              key={value}
              label={`${new Intl.NumberFormat(i18n.language).format(value)}×`}
              selected={player.rate === value}
              onPress={() => player.setRate(value)}
            />
          ))}
        </ChoiceGroup>
        <ToggleRow
          label={t('stories.player.captions')}
          value={captions || !hasSound}
          onChange={setCaptions}
        />
        <Text variant="small" tone="subtle">
          {t('stories.player.captionsHint')}
        </Text>
      </View>
      <View className="gap-1">
        {episode.lines.map((line, index) => (
          <Line
            key={index}
            text={line.text}
            speaker={episode.names[line.speaker] ?? ''}
            current={player.playing && player.line === index}
            captions={captions || !hasSound}
            onLookup={(word, caption) => setSelected({ language, word, caption })}
          />
        ))}
      </View>
      {episode.words.length > 0 ? (
        <Section title={t('stories.player.words')} count={episode.words.length}>
          <Text variant="langLine">{episode.words.join(' · ')}</Text>
        </Section>
      ) : null}
      <Section title={t('stories.questions.title')}>
        {ended || !hasSound ? (
          <View className="gap-4">
            {episode.questions.map((question, index) => (
              <StoryQuestion
                key={index}
                episodeId={episode.id}
                index={index}
                question={question.question}
                answer={question.answer}
                earlier={episode.answers.find((a) => a.question === index) ?? null}
              />
            ))}
          </View>
        ) : (
          <Text tone="muted">{t('stories.questions.listenFirst')}</Text>
        )}
      </Section>
      <CaptionLookupSheet
        selection={selected}
        onClose={() => setSelected(null)}
        lookup={lookupCaption}
        save={saveCaptionWord}
        labels={{
          loading: t('captionLookup.loading'),
          failed: t('captionLookup.failed'),
          save: t('captionLookup.save'),
          saved: t('captionLookup.saved'),
          uncertain: t('captionLookup.uncertain'),
          saveFailed: t('captionLookup.saveFailed'),
          plural: t('captionLookup.plural'),
        }}
      />
    </View>
  );
}

/**
 * 5.29 One episode of the listening series: the learner listens with the text hidden (each
 * line can be shown, and any word looked up and saved), at the speed they choose, then answers
 * its questions out loud. Listening to the end counts the episode's words as heard.
 */
export function StoryEpisodeScreen() {
  const { t } = useTranslation();
  const { status } = useSession();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { listenedToStory, home: homeStore } = usePracticeServices();
  const home = useHome();
  const { state, update } = useEpisode(id);
  const signedIn = status === 'signedIn';

  useEffect(() => {
    if (signedIn) void homeStore.load();
  }, [signedIn, homeStore]);

  if (!signedIn) return <Redirect href={ROUTES.welcome} />;
  const episode = state.phase === 'ready' ? state.episode : null;
  const language = home.phase === 'ready' ? home.data.language : '';
  return (
    <StepLayout
      header={
        <View className="min-h-tap flex-row items-center">
          <HeaderButton
            icon="chevronLeft"
            label={t('common.back')}
            onPress={() => backOr(ROUTES.stories)}
          />
        </View>
      }
    >
      {!episode ? (
        <LoadState
          failed={state.phase === 'failed'}
          loadingLabel={t('stories.loading')}
          slowLabel={t('common.wakingUp')}
          failedLabel={t(
            state.phase === 'failed' && state.code === 'network'
              ? 'errors.network'
              : 'stories.loadFailed',
          )}
          retryLabel={t('common.retry')}
          onRetry={() => backOr(ROUTES.stories)}
        />
      ) : (
        <>
          <Reveal>
            <PageHero
              color="pink"
              icon="play"
              title={episode.title || t('stories.episode', { number: episode.number })}
              body={[
                t('stories.episode', { number: episode.number }),
                episode.names.filter(Boolean).length
                  ? t('stories.with', { names: episode.names.filter(Boolean).join(' & ') })
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            />
          </Reveal>
          {episode.status === 'ready' ? (
            <Player
              episode={episode}
              language={language}
              onListened={() => {
                if (episode.listened) return;
                listenedToStory(episode.id).then(update, () => {});
              }}
            />
          ) : (
            <NoticeBox icon="info">
              {episode.status === 'pending'
                ? t('stories.writing', { number: episode.number })
                : t('stories.failedEpisode')}
            </NoticeBox>
          )}
        </>
      )}
    </StepLayout>
  );
}
