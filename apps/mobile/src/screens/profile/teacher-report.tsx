import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { TeacherReport } from '@konvami/api-client';
import { apiErrorCode } from '@/api/messages';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ChoiceChip } from '@/components/choice-chip';
import { ChoiceGroup, ToggleRow } from '@/components/choice-group';
import { LoadState } from '@/components/load-state';
import { Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { Text } from '@/components/text';
import { useTopicLabels } from '@/hooks/use-labels';
import { formatShortDate, wholeMinutes } from '@/lib/format';
import { commitFeedback, successFeedback } from '@/lib/haptics';
import { staggerDelay } from '@/lib/motion';
import { teacherReportHtml, type TeacherReportLabels } from '@/lib/teacher-report';
import { usePracticeServices } from '@/practice/services';
import { TEACHER_REPORT_DAYS, type TeacherReportDays } from '@/practice/real-life-services';
import { useSession } from '@/auth';
import { ProfilePage } from './page';

/** What was read, for which period and attempt (`key`): anything else is still loading. */
type Reading =
  { phase: 'failed'; key: string } | { phase: 'ready'; key: string; report: TeacherReport };

/** The labels the PDF is written with, in the app's language. */
function usePdfLabels(): TeacherReportLabels {
  const { t, i18n } = useTranslation();
  const topics = useTopicLabels();
  const { clock } = usePracticeServices();
  const now = new Date(clock.now());
  return {
    heading: t('teacherReport.pdf.heading'),
    learner: t('teacherReport.pdf.learner'),
    language: t('teacherReport.pdf.language'),
    level: t('teacherReport.pdf.level'),
    period: t('teacherReport.pdf.period'),
    minutes: t('teacherReport.pdf.minutes'),
    conversations: t('teacherReport.pdf.conversations'),
    mistakes: t('teacherReport.pdf.mistakes'),
    said: t('teacherReport.pdf.said'),
    better: t('teacherReport.pdf.better'),
    grammar: t('teacherReport.pdf.grammar'),
    levels: t('teacherReport.pdf.levels'),
    evidence: t('teacherReport.pdf.evidence'),
    grammarSkill: t('teacherReport.pdf.grammarSkill'),
    vocabulary: t('teacherReport.pdf.vocabulary'),
    speaking: t('teacherReport.pdf.speaking'),
    transcripts: t('teacherReport.pdf.transcripts'),
    recording: t('teacherReport.pdf.recording'),
    none: t('teacherReport.pdf.none'),
    footer: t('teacherReport.pdf.footer'),
    category: (id) =>
      t(`report.category.${id}` as 'report.category.other', {
        defaultValue: t('report.category.other'),
      }),
    topic: topics.name,
    mastery: (state) => t(`grammar.mastery.${state}` as 'grammar.mastery.practising'),
    fit: (fit) =>
      t(`teacherReport.pdf.fit.${fit}` as 'teacherReport.pdf.fit.at', { defaultValue: fit }),
    languageName: (code) =>
      t(`onboarding.languages.${code}` as 'onboarding.languages.de', { defaultValue: code }),
    date: (iso) => formatShortDate(i18n.language, iso, now),
  };
}

/**
 * 6.23 Report for my teacher: what the conversations of the last 7, 30 or 90 days showed (the
 * confirmed mistakes by kind, the grammar topics, the level over time and its evidence) as a
 * PDF the learner shares through the system's share sheet. They may add transcripts of the
 * conversations they tick, and links to the recordings (which work for an hour); nothing else
 * of their voice goes in, and Konvami sends the PDF to no one.
 */
export function TeacherReportScreen() {
  const { t, i18n } = useTranslation();
  const { readTeacherReport, readConversation, libraryTools, clock } = usePracticeServices();
  const { user } = useSession();
  const labels = usePdfLabels();
  const [days, setDays] = useState<TeacherReportDays>(30);
  const [attempt, setAttempt] = useState(0);
  const [reading, setReading] = useState<Reading | null>(null);
  const key = `${days}:${attempt}`;
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());
  const [recordings, setRecordings] = useState(false);
  const [making, setMaking] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let current = true;
    readTeacherReport(days).then(
      (report) => current && setReading({ phase: 'ready', key, report }),
      () => current && setReading({ phase: 'failed', key }),
    );
    return () => {
      current = false;
    };
  }, [readTeacherReport, days, key]);

  async function make(report: TeacherReport) {
    commitFeedback();
    setMaking(true);
    setFailed(false);
    try {
      const transcripts = await Promise.all(
        report.conversations.filter((c) => ticked.has(c.id)).map((c) => readConversation(c.id)),
      );
      const name = user?.firstName?.trim() || null;
      const html = teacherReportHtml(report, labels, {
        learner: name || null,
        transcripts,
        recordings,
        speaker: (transcript, learner) =>
          learner
            ? name || t('teacherReport.pdf.learner')
            : (transcript.conversation.partner?.name ?? t('conversations.formerPartner')),
      });
      if (!libraryTools) throw new Error('sharing_unavailable');
      await libraryTools.sharePdf(html, `konvami-report-${days}`);
      successFeedback();
    } catch (error) {
      if (apiErrorCode(error) !== 'cancelled') setFailed(true);
    } finally {
      setMaking(false);
    }
  }

  const shown = reading?.key === key ? reading : null;
  const report = shown?.phase === 'ready' ? shown.report : null;
  const now = new Date(clock.now());
  return (
    <ProfilePage
      hero={{ color: 'ink', icon: 'file' }}
      title={t('teacherReport.title')}
      body={t('teacherReport.body')}
      actions={
        report ? (
          <Button
            label={making ? t('teacherReport.making') : t('teacherReport.make')}
            loading={making}
            disabled={making || report.conversations.length === 0}
            onPress={() => void make(report)}
          />
        ) : undefined
      }
    >
      <View accessibilityLiveRegion="polite">
        {failed ? <NoticeBox icon="info">{t('teacherReport.failed')}</NoticeBox> : null}
      </View>
      <Reveal delay={staggerDelay(1)}>
        <ChoiceGroup label={t('teacherReport.period')} chips>
          {TEACHER_REPORT_DAYS.map((period) => (
            <ChoiceChip
              key={period}
              label={t(`teacherReport.days_${period}`)}
              selected={period === days}
              onPress={() => {
                setDays(period);
                setTicked(new Set());
              }}
            />
          ))}
        </ChoiceGroup>
      </Reveal>
      {report ? (
        <>
          <Reveal delay={staggerDelay(2)}>
            <Card className="gap-2 p-3.5">
              <Text variant="labelMedium">
                {t('teacherReport.summary', {
                  conversations: t('teacherReport.conversations', {
                    count: report.conversations.length,
                  }),
                  minutes: t('time.minutes', { count: wholeMinutes(report.seconds) }),
                })}
              </Text>
              <Text variant="labelMedium">{t('teacherReport.mistakesTitle')}</Text>
              {report.mistakes.length ? (
                report.mistakes.slice(0, 5).map((kind) => (
                  <Text key={kind.category} variant="small" tone="muted">
                    {`${labels.category(kind.category)} (${kind.count})`}
                  </Text>
                ))
              ) : (
                <Text variant="small" tone="muted">
                  {t('teacherReport.mistakesEmpty')}
                </Text>
              )}
            </Card>
          </Reveal>
          {report.conversations.length ? (
            <Reveal delay={staggerDelay(3)}>
              <Card className="gap-1 p-3.5">
                <Text variant="labelMedium">{t('teacherReport.transcriptsTitle')}</Text>
                <Text variant="small" tone="muted">
                  {t('teacherReport.transcriptsHint')}
                </Text>
                {report.conversations.map((conversation) => (
                  <ToggleRow
                    key={conversation.id}
                    label={[
                      formatShortDate(i18n.language, conversation.startedAt, now),
                      conversation.partnerName,
                      t('time.minutes', { count: wholeMinutes(conversation.seconds) }),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    value={ticked.has(conversation.id)}
                    onChange={(on) =>
                      setTicked((now) => {
                        const next = new Set(now);
                        if (on) next.add(conversation.id);
                        else next.delete(conversation.id);
                        return next;
                      })
                    }
                  />
                ))}
                {ticked.size > 0 ? (
                  <>
                    <ToggleRow
                      label={t('teacherReport.recordings')}
                      value={recordings}
                      onChange={setRecordings}
                    />
                    <Text variant="small" tone="muted">
                      {t('teacherReport.recordingsHint')}
                    </Text>
                  </>
                ) : null}
              </Card>
            </Reveal>
          ) : (
            <NoticeBox icon="info">{t('teacherReport.empty')}</NoticeBox>
          )}
        </>
      ) : (
        <LoadState
          failed={shown?.phase === 'failed'}
          loadingLabel={t('teacherReport.loading')}
          slowLabel={t('common.wakingUp')}
          failedLabel={t('teacherReport.loadFailed')}
          retryLabel={t('common.retry')}
          onRetry={() => setAttempt((count) => count + 1)}
        />
      )}
    </ProfilePage>
  );
}
