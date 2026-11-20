import { useCallback } from 'react';
import { View } from 'react-native';
import { Redirect, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { Coach, CoachFinding, CoachSuggestion } from '@konvami/api-client';
import { useSession } from '@/auth';
import { Badge } from '@/components/badge';
import { Card } from '@/components/card';
import { Icon } from '@/components/icon';
import { LoadState } from '@/components/load-state';
import { Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { PageHero } from '@/components/page-hero';
import { Section } from '@/components/section';
import { HeaderButton } from '@/components/step-header';
import { StepLayout } from '@/components/step-layout';
import { Text } from '@/components/text';
import { formatShortDate } from '@/lib/format';
import { staggerDelay } from '@/lib/motion';
import { backOr } from '@/lib/navigation';
import { ROUTES } from '@/lib/routes';
import { useCoach, usePracticeServices } from '@/practice/services';
import { useTheme } from '@/theme';
import { SuggestionCard } from './suggestion-card';
import { useCoachWords } from './words';

/** One finding as a row: what it is, and which way it is going when that is known. */
function FindingRow({ finding, good }: { finding: CoachFinding; good: boolean }) {
  const { t } = useTranslation();
  const { color } = useTheme();
  const { finding: line } = useCoachWords();
  const text = line(finding);
  if (!text) return null;
  return (
    <View className="min-h-tap flex-row items-center gap-3 py-2">
      <Icon
        name={good ? 'check' : 'target'}
        color={good ? color.primaryText : color.fgMuted}
        size={18}
      />
      <Text variant="small" className="flex-1">
        {text}
      </Text>
      {/* Never red: a pattern to work on is not an alarm (spec §14.3). */}
      {finding.trend ? <Badge tone="chip" label={t(`coach.trend.${finding.trend}`)} /> : null}
    </View>
  );
}

function Findings({
  findings,
  good,
  empty,
}: {
  findings: CoachFinding[];
  good: boolean;
  empty: string;
}) {
  return (
    <Card className="px-4 py-2">
      {findings.length ? (
        findings.map((finding, i) => (
          <View
            key={`${finding.kind}-${i}`}
            className={i > 0 ? 'border-t border-border' : undefined}
          >
            <FindingRow finding={finding} good={good} />
          </View>
        ))
      ) : (
        <Text variant="small" tone="muted" className="py-3">
          {empty}
        </Text>
      )}
    </Card>
  );
}

/** An earlier suggestion: its words, its day and what came of it. */
function HistoryRow({ suggestion }: { suggestion: CoachSuggestion }) {
  const { t, i18n } = useTranslation();
  const { clock } = usePracticeServices();
  const { words } = useCoachWords();
  const { title } = words(suggestion);
  if (!title) return null;
  const outcome = suggestion.outcome
    ? suggestion.acted
      ? t('coach.outcome.acted')
      : t(`coach.outcome.${suggestion.outcome}`)
    : t(`coach.outcome.${suggestion.status}`);
  return (
    <View className="min-h-tap gap-1 py-2.5">
      <Text variant="small">{title}</Text>
      <Text variant="caption" tone="subtle">
        {`${formatShortDate(i18n.language, suggestion.day, new Date(clock.now()))} · ${outcome}`}
      </Text>
    </View>
  );
}

function Day({ coach }: { coach: Coach }) {
  const { t } = useTranslation();
  const sections = [
    <Section key="today" title={t('coach.sections.today')}>
      <View className="gap-3">
        {coach.wording === 'pending' ? (
          <NoticeBox icon="edit">{t('coach.writing')}</NoticeBox>
        ) : null}
        {coach.suggestions.length ? (
          coach.suggestions.map((suggestion, i) => (
            <SuggestionCard
              key={suggestion.id}
              suggestion={suggestion}
              main={i === 0 && coach.leads}
            />
          ))
        ) : (
          <Card className="p-4">
            <Text variant="small" tone="muted">
              {t('coach.empty')}
            </Text>
          </Card>
        )}
      </View>
    </Section>,
    <Section key="holding" title={t('coach.sections.holdingBack')}>
      <Findings
        findings={coach.holdingBack}
        good={false}
        empty={t('coach.sections.holdingBackEmpty')}
      />
    </Section>,
    <Section key="well" title={t('coach.sections.goingWell')}>
      <Findings findings={coach.goingWell} good empty={t('coach.sections.goingWellEmpty')} />
    </Section>,
    coach.history.length ? (
      <Section key="history" title={t('coach.sections.history')} collapsible>
        <Card className="px-4 py-1">
          {coach.history.map((suggestion, i) => (
            <View key={suggestion.id} className={i > 0 ? 'border-t border-border' : undefined}>
              <HistoryRow suggestion={suggestion} />
            </View>
          ))}
        </Card>
      </Section>
    ) : null,
  ].filter((section) => section !== null);
  return (
    <View className="gap-6">
      {sections.map((section, i) => (
        <Reveal key={section.key} delay={staggerDelay(i + 1)}>
          {section}
        </Reveal>
      ))}
    </View>
  );
}

/**
 * 5.26 Coach: what would help the learner most now and why, from what they did; what holds them
 * back and what went well; and what came of earlier suggestions. Ink, like the Tutor: asking
 * Konvami what to do next.
 */
export function CoachScreen() {
  const { t } = useTranslation();
  const { status } = useSession();
  const { coach: store } = usePracticeServices();
  const coach = useCoach();

  useFocusEffect(
    useCallback(() => {
      void store.revisit();
    }, [store]),
  );

  if (status !== 'signedIn') return <Redirect href={ROUTES.welcome} />;
  return (
    <StepLayout
      header={
        <View className="min-h-tap flex-row items-center">
          <HeaderButton
            icon="chevronLeft"
            label={t('common.back')}
            onPress={() => backOr(ROUTES.today)}
          />
        </View>
      }
    >
      <Reveal>
        <PageHero color="ink" icon="compass" title={t('coach.title')} body={t('coach.body')} />
      </Reveal>
      {coach.phase === 'ready' ? (
        <Day coach={coach.data} />
      ) : (
        <LoadState
          failed={coach.phase === 'failed'}
          loadingLabel={t('coach.loading')}
          slowLabel={t('common.wakingUp')}
          failedLabel={t(coach.error === 'network' ? 'errors.network' : 'coach.loadFailed')}
          retryLabel={t('common.retry')}
          onRetry={() => void store.reload()}
        />
      )}
    </StepLayout>
  );
}
