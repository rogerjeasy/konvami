import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Redirect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { PhraseSuggestion } from '@konvami/api-client';
import { apiErrorCode } from '@/api/messages';
import { useSession } from '@/auth';
import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { LoadState } from '@/components/load-state';
import { Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { Section } from '@/components/section';
import { HeaderButton } from '@/components/step-header';
import { StepLayout } from '@/components/step-layout';
import { Text } from '@/components/text';
import { TextField } from '@/components/text-field';
import { commitFeedback } from '@/lib/haptics';
import { staggerDelay } from '@/lib/motion';
import { backOr } from '@/lib/navigation';
import { ROUTES } from '@/lib/routes';
import { usePhrasebook, usePracticeServices } from '@/practice/services';
import { PhraseCard } from './phrase-card';
import { SuggestionCard } from './suggestion-card';
import { ManualPhrase } from './manual-phrase';
import { groupPhrases } from '@/lib/phrase-groups';

// The longest situation the server takes (characters).
const SITUATION_MAX = 200;

/** The message for a request the phrasebook did not complete. */
function failureKey(code: string) {
  switch (code) {
    case 'suggestion_limit':
      return 'phrasebook.limit';
    case 'consent_required':
      return 'phrasebook.consent';
    case 'too_many':
      return 'phrasebook.tooMany';
    case 'network':
      return 'errors.network';
    default:
      return 'phrasebook.failed';
  }
}

/**
 * 5.19 Phrasebook (spec §6.7): the phrases the learner needs in their life. They say what they
 * need ("an appointment at the doctor"), get a few phrases with their meaning in their own
 * language, and keep the ones they want. A kept phrase can become a flashcard. Reached from
 * Learn.
 */
export function PhrasebookScreen() {
  const { t } = useTranslation();
  const { status } = useSession();
  const { phrasebook: store, suggestPhrases, keepPhrase } = usePracticeServices();
  const state = usePhrasebook();
  const [draft, setDraft] = useState('');
  // What the suggestions below are for, and the suggestions themselves.
  const [asked, setAsked] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<PhraseSuggestion[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const signedIn = status === 'signedIn';
  const ready = state.phase === 'ready';

  useEffect(() => {
    if (signedIn) void store.load();
  }, [signedIn, store]);

  async function suggest(situation: string) {
    setSuggesting(true);
    setFailure(null);
    try {
      setSuggestions(await suggestPhrases(situation));
      setAsked(situation);
    } catch (error) {
      setFailure(t(failureKey(apiErrorCode(error))));
    } finally {
      setSuggesting(false);
    }
  }

  async function keep(suggestion: PhraseSuggestion) {
    commitFeedback();
    setFailure(null);
    try {
      await keepPhrase({
        phrase: suggestion.phrase,
        meaning: suggestion.meaning,
        situation: asked,
      });
      setSuggestions((shown) =>
        shown.map((item) => (item.phrase === suggestion.phrase ? { ...item, saved: true } : item)),
      );
    } catch (error) {
      setFailure(t(failureKey(apiErrorCode(error))));
    }
  }

  if (!signedIn) return <Redirect href={ROUTES.welcome} />;
  const situation = draft.trim();
  const phrases = state.phase === 'ready' ? state.data.phrases : [];
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
      actions={
        ready ? (
          <View className="gap-2.5">
            <TextField
              label={t('phrasebook.field')}
              placeholder={t('phrasebook.placeholder')}
              value={draft}
              onChangeText={setDraft}
              maxLength={SITUATION_MAX}
              returnKeyType="search"
              onSubmitEditing={() => {
                if (situation && !suggesting) void suggest(situation);
              }}
            />
            <Button
              label={t('phrasebook.suggest')}
              disabled={!situation}
              loading={suggesting}
              onPress={() => {
                commitFeedback();
                void suggest(situation);
              }}
            />
          </View>
        ) : undefined
      }
    >
      <Reveal>
        <View className="gap-1.5">
          <Text variant="title" accessibilityRole="header">
            {t('phrasebook.title')}
          </Text>
          <Text tone="muted">{t('phrasebook.body')}</Text>
        </View>
      </Reveal>
      {!ready ? (
        <LoadState
          failed={state.phase === 'failed'}
          loadingLabel={t('phrasebook.loading')}
          slowLabel={t('common.wakingUp')}
          failedLabel={t(state.error === 'network' ? 'errors.network' : 'phrasebook.loadFailed')}
          retryLabel={t('common.retry')}
          onRetry={() => void store.reload()}
        />
      ) : (
        <View className="gap-6">
          <ManualPhrase onFailed={(code) => setFailure(t(failureKey(code)))} />
          {failure ? (
            <View accessibilityLiveRegion="polite">
              <NoticeBox icon="alert" tone="danger">
                {failure}
              </NoticeBox>
            </View>
          ) : null}
          {suggesting ? (
            <Text tone="muted" accessibilityLiveRegion="polite">
              {t('phrasebook.thinking')}
            </Text>
          ) : null}
          {asked && suggestions.length > 0 ? (
            <Reveal>
              <Section title={t('phrasebook.suggestionsFor', { situation: asked })}>
                <View className="gap-3">
                  {suggestions.map((suggestion, i) => (
                    <Reveal key={suggestion.phrase} delay={staggerDelay(Math.min(i, 3))}>
                      <SuggestionCard
                        suggestion={suggestion}
                        onKeep={() => void keep(suggestion)}
                      />
                    </Reveal>
                  ))}
                  <Text variant="small" tone="subtle">
                    {t('phrasebook.checkNote')}
                  </Text>
                </View>
              </Section>
            </Reveal>
          ) : null}
          {phrases.length === 0 ? (
            suggestions.length === 0 ? (
              <EmptyState
                icon="message"
                title={t('phrasebook.emptyTitle')}
                body={t('phrasebook.emptyBody')}
              />
            ) : null
          ) : (
            <Section title={t('phrasebook.yours')} count={phrases.length}>
              <View className="gap-3">
                {groupPhrases(phrases).map((group) => (
                  <View key={group.name ?? ''} className="gap-3">
                    {group.name ? (
                      <Text variant="heading" accessibilityRole="header">
                        {group.name}
                      </Text>
                    ) : null}
                    {group.phrases.map((phrase, i) => (
                      <Reveal key={phrase.id} delay={staggerDelay(Math.min(i, 3) + 1)}>
                        <PhraseCard
                          phrase={phrase}
                          onFailed={(code) => setFailure(t(failureKey(code)))}
                        />
                      </Reveal>
                    ))}
                  </View>
                ))}
              </View>
            </Section>
          )}
        </View>
      )}
    </StepLayout>
  );
}
