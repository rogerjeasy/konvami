import { useCallback, useEffect } from 'react';
import { Pressable, View } from 'react-native';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import type { GrammarTopic } from '@konvami/api-client';
import { useSession } from '@/auth';
import { Icon } from '@/components/icon';
import { ListGroup } from '@/components/list';
import { LoadState } from '@/components/load-state';
import { MasterySteps } from '@/components/mastery-steps';
import { Reveal } from '@/components/motion';
import { Section } from '@/components/section';
import { HeaderButton } from '@/components/step-header';
import { StepLayout } from '@/components/step-layout';
import { Text } from '@/components/text';
import { staggerDelay } from '@/lib/motion';
import { backOr } from '@/lib/navigation';
import { grammarTopicRoute, ROUTES } from '@/lib/routes';
import { useGrammarMap, usePracticeServices } from '@/practice/services';
import { useTheme } from '@/theme';
import { useTopicLabels } from './labels';

// The states that count as having a topic: what the summary at the top adds up.
const SOLID: readonly GrammarTopic['mastery'][] = ['mostly_correct', 'mastered'];

/** One topic: its name, how far it is, and how often it was right. The whole row is the button. */
function TopicRow({ topic }: { topic: GrammarTopic }) {
  const { color } = useTheme();
  const { name, mastery, right } = useTopicLabels();
  const detail = topic.uses ? right(topic) : null;
  const label = [name(topic.id), mastery(topic.mastery), detail].filter(Boolean).join(', ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => router.push(grammarTopicRoute(topic.id))}
      className="min-h-button flex-row items-center gap-3 p-3.5 active:opacity-pressed"
    >
      <View className="flex-1 gap-1.5">
        <Text variant="label">{name(topic.id)}</Text>
        <View className="flex-row flex-wrap items-center gap-x-2.5 gap-y-1">
          <MasterySteps mastery={topic.mastery} />
          <Text variant="small" tone="muted">
            {detail ? `${mastery(topic.mastery)} · ${detail}` : mastery(topic.mastery)}
          </Text>
        </View>
      </View>
      <Icon name="chevronRight" color={color.fgSubtle} size={size.iconMd} />
    </Pressable>
  );
}

/**
 * 5.14 Grammar map (spec §6.8): every topic of the language learned from A1 up, grouped by level,
 * each with how well the learner uses it. The states come from what their conversations showed,
 * right uses as much as mistakes, not from quizzes. A topic opens its page (5.15).
 */
export function GrammarMapScreen() {
  const { t } = useTranslation();
  const { status } = useSession();
  const { grammar: store } = usePracticeServices();
  const state = useGrammarMap();
  const signedIn = status === 'signedIn';

  useEffect(() => {
    if (signedIn) void store.load();
  }, [signedIn, store]);

  // A report written since may have moved a topic.
  useFocusEffect(
    useCallback(() => {
      void store.revisit();
    }, [store]),
  );

  if (!signedIn) return <Redirect href={ROUTES.welcome} />;
  const map = state.phase === 'ready' ? state.data : null;
  const levels = map ? [...new Set(map.topics.map((topic) => topic.level))] : [];
  const solid = map ? map.topics.filter((topic) => SOLID.includes(topic.mastery)).length : 0;
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
            {t('grammar.title')}
          </Text>
          <Text tone="muted">{t('grammar.body')}</Text>
          {map ? (
            <Text variant="labelSmall" tone="primary">
              {t('grammar.summary', { count: solid, total: map.topics.length })}
            </Text>
          ) : null}
        </View>
      </Reveal>
      {!map ? (
        <LoadState
          failed={state.phase === 'failed'}
          loadingLabel={t('grammar.loading')}
          slowLabel={t('common.wakingUp')}
          failedLabel={t(state.error === 'network' ? 'errors.network' : 'grammar.loadFailed')}
          retryLabel={t('common.retry')}
          onRetry={() => void store.reload()}
        />
      ) : (
        <View className="gap-6">
          {levels.map((level, i) => (
            <Reveal key={level} delay={staggerDelay(Math.min(i, 3) + 1)}>
              <Section title={level === map.level ? t('grammar.yourLevel', { level }) : level}>
                <ListGroup>
                  {map.topics
                    .filter((topic) => topic.level === level)
                    .map((topic) => (
                      <TopicRow key={topic.id} topic={topic} />
                    ))}
                </ListGroup>
              </Section>
            </Reveal>
          ))}
        </View>
      )}
    </StepLayout>
  );
}
