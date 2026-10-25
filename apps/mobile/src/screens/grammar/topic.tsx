import { View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import type { GrammarTopicPage } from '@konvami/api-client';
import { useSession } from '@/auth';
import { Badge } from '@/components/badge';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { CorrectionCard } from '@/components/correction-card';
import { Icon } from '@/components/icon';
import { LoadState } from '@/components/load-state';
import { MasterySteps } from '@/components/mastery-steps';
import { Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { Section } from '@/components/section';
import { HeaderButton } from '@/components/step-header';
import { StepLayout } from '@/components/step-layout';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { commitFeedback } from '@/lib/haptics';
import { staggerDelay } from '@/lib/motion';
import { backOr } from '@/lib/navigation';
import { askTutorRoute, callRoute, conversationRoute, ROUTES } from '@/lib/routes';
import { diffWords } from '@/lib/word-diff';
import { useGrammarTopic, useSuggestedPartner } from '@/practice/services';
import { useTheme } from '@/theme';
import { useTopicLabels } from './labels';

/** Where the topic stands: its state, the numbers behind it and which way it is going. */
function Standing({ page }: { page: GrammarTopicPage }) {
  const { t } = useTranslation();
  const { mastery } = useTopicLabels();
  const { topic } = page;
  return (
    <Card className="gap-3 p-4">
      <View className="flex-row flex-wrap items-center gap-2.5">
        <MasterySteps mastery={topic.mastery} />
        <Text variant="labelMedium">{mastery(topic.mastery)}</Text>
      </View>
      <Text tone="muted">
        {topic.uses
          ? t('grammar.topic.uses', {
              correct: topic.correct,
              uses: topic.uses,
              count: topic.conversations,
            })
          : t('grammar.topic.notStarted')}
      </Text>
      {topic.trend ? (
        <Text variant="labelSmall" tone={topic.trend === 'slipping' ? 'warn' : 'primary'}>
          {t(`grammar.trend.${topic.trend}`)}
        </Text>
      ) : null}
    </Card>
  );
}

/** Sentences as a short list, each after a mark: right ones with a check, wrong ones amber. */
function Sentences({ items, wrong = false }: { items: readonly string[]; wrong?: boolean }) {
  const { color } = useTheme();
  return (
    <View className="gap-2">
      {items.map((sentence) => (
        <View key={sentence} className="flex-row items-start gap-2.5">
          <View className="pt-0.5" aria-hidden>
            <Icon
              name={wrong ? 'edit' : 'check'}
              color={wrong ? color.warnIcon : color.success}
              size={size.icon}
            />
          </View>
          <Text variant="callout" tone={wrong ? 'muted' : 'fg'} className="flex-1">
            {sentence}
          </Text>
        </View>
      ))}
    </View>
  );
}

/**
 * 5.15 One topic of the grammar map (spec §6.8 "topic page"): how well the learner uses it, the
 * topic used well, typical mistakes, and the learner's own mistakes on it, each leading to the
 * conversation it was made in. From here they practise it in a conversation whose plan puts it
 * first, or ask the Tutor about it.
 */
export function GrammarTopicScreen() {
  const { t } = useTranslation();
  const { status } = useSession();
  const { topic: id = '' } = useLocalSearchParams<{ topic: string }>();
  const reading = useGrammarTopic(id);
  const { name } = useTopicLabels();
  const partner = useSuggestedPartner();
  const signedIn = status === 'signedIn';

  if (!signedIn) return <Redirect href={ROUTES.welcome} />;
  const page = reading.phase === 'ready' ? reading.page : null;
  const title = name(id);
  return (
    <StepLayout
      header={
        <View className="min-h-tap flex-row items-center">
          <HeaderButton
            icon="chevronLeft"
            label={t('common.back')}
            onPress={() => backOr(ROUTES.grammar)}
          />
        </View>
      }
      actions={
        page ? (
          <>
            <Button
              label={t('grammar.topic.practise')}
              disabled={!partner}
              onPress={() => {
                if (!partner) return;
                commitFeedback();
                router.push(callRoute(partner, { practise: id }));
              }}
            />
            <TextButton
              tone="primary"
              label={t('grammar.topic.ask')}
              onPress={() =>
                router.push(askTutorRoute(t('grammar.topic.question', { topic: title })))
              }
            />
          </>
        ) : undefined
      }
    >
      {reading.phase === 'failed' && reading.code === 'not_found' ? (
        <NoticeBox icon="info">{t('grammar.topic.notFound')}</NoticeBox>
      ) : !page ? (
        <LoadState
          failed={reading.phase === 'failed'}
          loadingLabel={t('grammar.topic.loading')}
          slowLabel={t('common.wakingUp')}
          failedLabel={t(
            reading.phase === 'failed' && reading.code === 'network'
              ? 'errors.network'
              : 'grammar.topic.loadFailed',
          )}
          retryLabel={t('common.retry')}
          onRetry={reading.retry}
        />
      ) : (
        <View className="gap-6">
          <Reveal>
            <View className="gap-2">
              <View className="flex-row flex-wrap items-center gap-2">
                <Text variant="title" accessibilityRole="header" className="shrink">
                  {title}
                </Text>
                <Badge label={page.topic.level} tone="chip" />
              </View>
            </View>
          </Reveal>
          <Reveal delay={staggerDelay(1)}>
            <Standing page={page} />
          </Reveal>
          <Reveal delay={staggerDelay(2)}>
            <Section title={t('grammar.topic.examples')}>
              <Sentences items={page.examples} />
            </Section>
          </Reveal>
          {page.typicalMistakes.length ? (
            <Reveal delay={staggerDelay(3)}>
              <Section title={t('grammar.topic.typical')}>
                <Sentences items={page.typicalMistakes} wrong />
              </Section>
            </Reveal>
          ) : null}
          <Reveal delay={staggerDelay(4)}>
            <Section title={t('grammar.topic.yours')}>
              <View testID="topic-mistakes" className="gap-2.5">
                {page.mistakes.length === 0 ? (
                  <Text tone="muted">{t('grammar.topic.none')}</Text>
                ) : (
                  page.mistakes.map((mistake, i) => {
                    const { before, after } = diffWords(mistake.original, mistake.corrected);
                    return (
                      <CorrectionCard
                        key={`${mistake.conversationId}:${i}`}
                        badge={mistake.certain ? undefined : t('report.polish.unsure')}
                        saidLabel={t('report.said')}
                        said={before}
                        betterLabel={t('report.better')}
                        better={after}
                        explanation={mistake.explanation}
                        accessibilityLabel={t('report.cardLabel', {
                          before: mistake.original,
                          label: t('report.better'),
                          after: mistake.corrected,
                          why: mistake.explanation,
                        })}
                        action={
                          <TextButton
                            tone="primary"
                            label={t('grammar.topic.read')}
                            onPress={() => router.push(conversationRoute(mistake.conversationId))}
                          />
                        }
                      />
                    );
                  })
                )}
              </View>
            </Section>
          </Reveal>
        </View>
      )}
    </StepLayout>
  );
}
