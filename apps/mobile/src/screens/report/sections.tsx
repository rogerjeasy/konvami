import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import type { ReportMistake, ReportRewrite, ReportWord } from '@konvami/api-client';
import { Card } from '@/components/card';
import { CorrectionCard } from '@/components/correction-card';
import { Icon, type IconName } from '@/components/icon';
import { ListGroup } from '@/components/list';
import { NoticeBox } from '@/components/notice-box';
import { Section } from '@/components/section';
import { Text } from '@/components/text';
import { diffWords } from '@/lib/word-diff';
import { useTheme, type ColorToken } from '@/theme';

/**
 * The learner's mistakes, each as what they said, how it is right and why. One the second check
 * could not confirm is marked as a hint. Without any, the report says so in one line.
 */
export function Polish({ mistakes }: { mistakes: readonly ReportMistake[] }) {
  const { t } = useTranslation();
  if (mistakes.length === 0) {
    return (
      <NoticeBox icon="check" tone="primary">
        {t('report.polish.empty')}
      </NoticeBox>
    );
  }
  return (
    <Section title={t('report.polish.title')} tone="warn" count={mistakes.length} collapsible>
      <View className="gap-2.5">
        {mistakes.map((mistake, i) => {
          const { before, after } = diffWords(mistake.original, mistake.corrected);
          return (
            <CorrectionCard
              key={i}
              // The server names the kind; one this app version has no name for is "Other".
              topic={t(`report.category.${mistake.category}` as 'report.category.other', {
                defaultValue: t('report.category.other'),
              })}
              badge={mistake.certain ? undefined : t('report.polish.unsure')}
              saidLabel={t('report.said')}
              said={before}
              betterLabel={t('report.better')}
              better={after}
              explanation={mistake.explanation}
              note={mistake.certain ? undefined : t('report.polish.unsureNote')}
              accessibilityLabel={t('report.cardLabel', {
                before: mistake.original,
                label: t('report.better'),
                after: mistake.corrected,
                why: mistake.explanation,
              })}
            />
          );
        })}
      </View>
    </Section>
  );
}

/** Sentences that were right, and how they are more usually said. */
export function Natural({ rewrites }: { rewrites: readonly ReportRewrite[] }) {
  const { t } = useTranslation();
  if (rewrites.length === 0) return null;
  return (
    <Section title={t('report.natural.title')} count={rewrites.length} collapsible>
      <View className="gap-2.5">
        {rewrites.map((rewrite, i) => {
          const { before, after } = diffWords(rewrite.original, rewrite.natural);
          return (
            <CorrectionCard
              key={i}
              saidLabel={t('report.said')}
              said={before}
              betterLabel={t('report.moreNatural')}
              better={after}
              explanation={rewrite.note}
              accessibilityLabel={t('report.cardLabel', {
                before: rewrite.original,
                label: t('report.moreNatural'),
                after: rewrite.natural,
                why: rewrite.note,
              })}
            />
          );
        })}
      </View>
    </Section>
  );
}

/** Words worth keeping: each with what it means and the sentence it came from. */
export function Words({ words }: { words: readonly ReportWord[] }) {
  const { t } = useTranslation();
  if (words.length === 0) return null;
  return (
    <Section title={t('report.words.title')} count={words.length} collapsible>
      <ListGroup>
        {words.map((word) => (
          <View key={word.text} className="gap-1 p-3.5">
            <View className="flex-row flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
              <Text variant="label">{word.text}</Text>
              <Text variant="small" tone="muted" className="shrink">
                {word.meaning}
              </Text>
            </View>
            {word.example ? (
              <Text variant="small" tone="subtle" className="italic">
                {word.example}
              </Text>
            ) : null}
          </View>
        ))}
      </ListGroup>
    </Section>
  );
}

/** A few lines, each led by the same small icon. */
function Points({
  icon,
  tint,
  lead,
  lines,
}: {
  icon: IconName;
  tint: ColorToken;
  /** A quiet sentence above the lines. */
  lead?: string;
  lines: readonly string[];
}) {
  const { color } = useTheme();
  return (
    <Card className="gap-2.5 p-4">
      {lead ? (
        <Text variant="small" tone="subtle">
          {lead}
        </Text>
      ) : null}
      {lines.map((line) => (
        <View key={line} className="flex-row items-start gap-2.5">
          <View className="pt-0.5">
            <Icon name={icon} color={color[tint]} size={size.icon} />
          </View>
          <Text variant="callout" className="flex-1">
            {line}
          </Text>
        </View>
      ))}
    </Card>
  );
}

/** What the learner did well, as the conversation shows it. */
export function Wins({ wins }: { wins: readonly string[] }) {
  const { t } = useTranslation();
  if (wins.length === 0) return null;
  return (
    <Section title={t('report.wins.title')} collapsible>
      <Points icon="check" tint="success" lines={wins} />
    </Section>
  );
}

/** What to practise next. The learner's partners are told the same before the next call. */
export function NextSteps({ steps }: { steps: readonly string[] }) {
  const { t } = useTranslation();
  if (steps.length === 0) return null;
  return (
    <Section title={t('report.next.title')} collapsible>
      <Points icon="target" tint="warnIcon" lead={t('report.next.body')} lines={steps} />
    </Section>
  );
}
