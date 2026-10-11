import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import type { ReportMistake, ReportRewrite, ReportWord } from '@konvami/api-client';
import { Card } from '@/components/card';
import { CorrectionCard } from '@/components/correction-card';
import { Icon, type IconName } from '@/components/icon';
import { ListGroup } from '@/components/list';
import { Pop } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { Section } from '@/components/section';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { diffWords } from '@/lib/word-diff';
import { useTheme, type ColorToken } from '@/theme';
import type { CardSaver } from './use-card-saver';

/**
 * The learner's mistakes, each as what they said, how it is right and why. One the second check
 * could not confirm is marked as a hint. Without any, the report says so in one line.
 */
export function Polish({
  mistakes,
  saver,
}: {
  mistakes: readonly ReportMistake[];
  saver: CardSaver;
}) {
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
              // Only what the second check confirmed is worth learning by heart.
              action={
                mistake.certain ? (
                  <SaveCorrection
                    saved={saver.isSaved('correction', i)}
                    saving={saver.isSaving('correction', i)}
                    onSave={() => void saver.save('correction', i)}
                  />
                ) : undefined
              }
              accessibilityLabel={t('report.cardLabel', {
                before: mistake.original,
                label: t('report.better'),
                after: mistake.corrected,
                why: mistake.explanation,
              })}
            />
          );
        })}
        <SaveFailure code={saver.failure('correction')} />
      </View>
    </Section>
  );
}

/** Why a card could not be saved, in the section it was to be saved from. */
function SaveFailure({ code }: { code: string | null }) {
  const { t } = useTranslation();
  if (code === null) return null;
  return (
    <NoticeBox icon="alert" tone="danger">
      {t(code === 'too_many' ? 'report.save.full' : 'report.save.failed')}
    </NoticeBox>
  );
}

/** A tick that pops in where a card was just made, or stands where one already was. */
function SavedTick() {
  const { color } = useTheme();
  return (
    <Pop>
      <Icon name="check" color={color.success} size={size.iconMd} strokeWidth={2.4} />
    </Pop>
  );
}

/** Under a confirmed correction: makes a card of it, then says that it is one. */
function SaveCorrection({
  saved,
  saving,
  onSave,
}: {
  saved: boolean;
  saving: boolean;
  onSave: () => void;
}) {
  const { t } = useTranslation();
  if (saved) {
    return (
      <View className="min-h-tap flex-row items-center gap-2">
        <SavedTick />
        <Text variant="labelSmall" tone="success">
          {t('report.save.correctionSaved')}
        </Text>
      </View>
    );
  }
  return (
    <View className="items-start">
      <TextButton
        tone="primary"
        label={t('report.save.correction')}
        disabled={saving}
        onPress={onSave}
      />
    </View>
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

/**
 * Words worth keeping: each with what it means and the sentence it came from, and a button
 * that makes a flashcard of it. A word that is a card shows a tick instead.
 */
export function Words({ words, saver }: { words: readonly ReportWord[]; saver: CardSaver }) {
  const { t } = useTranslation();
  const { color } = useTheme();
  if (words.length === 0) return null;
  const unsaved = words.filter((_, i) => !saver.isSaved('word', i)).length;
  return (
    <Section title={t('report.words.title')} count={words.length} collapsible>
      <View className="gap-2.5">
        <ListGroup>
          {words.map((word, i) => (
            <View key={word.text} className="flex-row items-center gap-2 py-2 pl-3.5 pr-1.5">
              <View className="flex-1 gap-1 py-1.5">
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
              {saver.isSaved('word', i) ? (
                <View
                  accessible
                  accessibilityRole="image"
                  accessibilityLabel={t('report.save.savedLabel', { word: word.text })}
                  className="min-h-tap min-w-tap items-center justify-center"
                >
                  <SavedTick />
                </View>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('report.save.wordLabel', { word: word.text })}
                  accessibilityState={{ disabled: saver.isSaving('word', i) }}
                  disabled={saver.isSaving('word', i)}
                  onPress={() => void saver.save('word', i)}
                  className="min-h-tap min-w-tap items-center justify-center rounded-pill active:opacity-pressed"
                >
                  <Icon name="plusCircle" color={color.primaryText} size={size.iconLg} />
                </Pressable>
              )}
            </View>
          ))}
        </ListGroup>
        <SaveFailure code={saver.failure('word')} />
        {unsaved > 1 ? (
          <View className="items-end">
            <TextButton
              tone="primary"
              label={t('report.save.all')}
              onPress={() => void saver.saveWords()}
            />
          </View>
        ) : null}
      </View>
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
