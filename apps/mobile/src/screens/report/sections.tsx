import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import type { ReportMistake, ReportRewrite, ReportWord } from '@konvami/api-client';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Icon, type IconName } from '@/components/icon';
import { Pop, PressScale } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { Section } from '@/components/section';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { diffWords } from '@/lib/word-diff';
import { useTheme, type ColorToken } from '@/theme';
import { PolishCard } from './polish-card';
import type { CardSaver } from './use-card-saver';

// The narrowest a correction's two buttons get side by side (pt); narrower, they stack.
const ACTION_MIN_WIDTH = 132;

/**
 * The learner's mistakes, each as what they said, how it is right and why, with the way to ask
 * the Tutor about it and, for a confirmed one, to say it better. One the second check could not
 * confirm is marked as a hint; one said right since is marked as such. Without any, the report
 * says so in one line.
 *
 * Each can be reported as wrong (spec §16.1). A reported hint is not shown again; a reported
 * confirmed correction stays, marked, with nothing to practise or save: drilling something the
 * learner calls wrong could teach a mistake. The numbers the actions get stay the report's own.
 */
export function Polish({
  mistakes,
  saver,
  practised,
  flagged,
  onFlag,
  onExplain,
  onRetry,
}: {
  mistakes: readonly ReportMistake[];
  saver: CardSaver;
  /** The mistakes the learner has said right since ("Say it better"). */
  practised: ReadonlySet<number>;
  /** The mistakes the learner has reported. */
  flagged: ReadonlySet<number>;
  /** Reports mistake `index` (spec §16.1 "That's wrong"). */
  onFlag: (index: number) => void;
  /** Asks the Tutor about mistake `index` (spec §6.5 "Explain my mistake"). */
  onExplain: (index: number) => void;
  /** Says mistake `index` again, put right (spec §6.5 "Say it better"). */
  onRetry: (index: number) => void;
}) {
  const { t } = useTranslation();
  const { color } = useTheme();
  if (mistakes.length === 0) {
    return (
      <NoticeBox icon="check" tone="primary">
        {t('report.polish.empty')}
      </NoticeBox>
    );
  }
  // A hint the learner reported is not shown again; its place in the report stays taken.
  const shown = mistakes.flatMap((mistake, i) =>
    flagged.has(i) && !mistake.certain ? [] : [{ mistake, i }],
  );
  if (shown.length === 0) {
    return <NoticeBox icon="info">{t('flag.allHidden')}</NoticeBox>;
  }
  return (
    <Section title={t('report.polish.title')} tone="warn" count={shown.length} collapsible>
      <View className="gap-2.5">
        {shown.map(({ mistake, i }) => {
          const { before, after } = diffWords(mistake.original, mistake.corrected);
          const reported = flagged.has(i);
          return (
            <PolishCard
              key={i}
              // The server names the kind; one this app version has no name for is "Other".
              topic={t(`report.category.${mistake.category}` as 'report.category.other', {
                defaultValue: t('report.category.other'),
              })}
              badge={
                reported
                  ? t('flag.reported')
                  : !mistake.certain
                    ? t('report.polish.unsure')
                    : practised.has(i)
                      ? t('report.retry.practised')
                      : undefined
              }
              saidLabel={t('report.said')}
              said={before}
              betterLabel={t('report.better')}
              better={after}
              explanation={mistake.explanation}
              note={mistake.certain ? undefined : t('report.polish.unsureNote')}
              action={
                <View className="gap-1">
                  {/* Only what the second check confirmed is worth learning by heart. */}
                  {mistake.certain && !reported ? (
                    <View className="flex-row flex-wrap gap-2">
                      <View className="flex-1" style={{ minWidth: ACTION_MIN_WIDTH }}>
                        <Button
                          label={t('report.retry.open')}
                          leading={<Icon name="mic" color={color.onPrimary} size={size.iconMd} />}
                          onPress={() => onRetry(i)}
                        />
                      </View>
                      <View className="flex-1" style={{ minWidth: ACTION_MIN_WIDTH }}>
                        <SaveCorrection
                          saved={saver.isSaved('correction', i)}
                          saving={saver.isSaving('correction', i)}
                          onSave={() => void saver.save('correction', i)}
                        />
                      </View>
                    </View>
                  ) : null}
                  <View className="flex-row flex-wrap items-center gap-x-2">
                    <TextButton label={t('report.polish.explain')} onPress={() => onExplain(i)} />
                    {reported ? null : (
                      <TextButton label={t('flag.openCorrection')} onPress={() => onFlag(i)} />
                    )}
                  </View>
                </View>
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
  const { color } = useTheme();
  if (saved) {
    // Where the button was, an ink pill that says the card exists (not a control any more).
    return (
      <View className="min-h-button flex-row items-center justify-center gap-2 rounded-pill bg-inverse px-4 py-3">
        <Pop>
          <Icon name="check" color={color.onInverse} size={size.iconMd} strokeWidth={2.4} />
        </Pop>
        <Text variant="labelSmall" tone="onInverse" className="shrink text-center">
          {t('report.save.correctionSaved')}
        </Text>
      </View>
    );
  }
  return (
    <Button
      variant="secondary"
      label={t('report.save.correction')}
      leading={<Icon name="plus" color={color.fg} size={size.iconMd} />}
      loading={saving}
      onPress={onSave}
    />
  );
}

// Stands between the two counts of what can be kept ("1 correction · 2 words").
const SEPARATOR = ' · ';

/**
 * Near the top of a report: one button that makes flashcards of everything in it worth keeping
 * (its confirmed corrections and its words), so a learner need not find each one further down.
 * Once all are cards it says so and leads to Learn, where they come back. Nothing when the
 * report has nothing that can be a card.
 */
export function Keep({
  mistakes,
  words,
  saver,
  onOpenLearn,
}: {
  mistakes: readonly ReportMistake[];
  words: readonly ReportWord[];
  saver: CardSaver;
  onOpenLearn: () => void;
}) {
  const { t } = useTranslation();
  if (words.length + mistakes.filter(({ certain }) => certain).length === 0) return null;
  const { corrections, words: wordsLeft } = saver.unsaved;
  const left = corrections + wordsLeft;
  if (left === 0) {
    return (
      <Card className="gap-1 p-4">
        <View accessibilityLiveRegion="polite" className="flex-row items-center gap-2">
          <SavedTick />
          <Text variant="label" tone="success" className="flex-1">
            {t('report.keep.saved')}
          </Text>
        </View>
        <Text variant="small" tone="muted">
          {t('report.keep.savedBody')}
        </Text>
        <View className="items-start">
          <TextButton tone="primary" label={t('report.keep.learn')} onPress={onOpenLearn} />
        </View>
      </Card>
    );
  }
  const counts = [
    corrections ? t('report.keep.corrections', { count: corrections }) : null,
    wordsLeft ? t('report.keep.words', { count: wordsLeft }) : null,
  ].filter((count) => count !== null);
  return (
    <Card className="gap-3 p-4">
      <View className="gap-1">
        <Text variant="label">{t('report.keep.title')}</Text>
        <Text variant="small" tone="muted">
          {counts.join(SEPARATOR)}
        </Text>
        <Text variant="small" tone="subtle">
          {t('report.keep.body')}
        </Text>
      </View>
      <SaveFailure code={saver.failureOfAll} />
      <Button
        variant="secondary"
        label={t('report.keep.save', { count: left })}
        loading={saver.savingAll}
        onPress={() => void saver.saveAll()}
      />
    </Card>
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
            <PolishCard
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
  if (words.length === 0) return null;
  return (
    <Section title={t('report.words.title')} count={words.length} collapsible>
      <View className="gap-2.5">
        <View className="gap-2">
          {words.map((word, i) => (
            <View
              key={word.text}
              className="gap-1.5 rounded-card border border-border bg-chip px-3.5 py-3"
            >
              <View className="flex-row flex-wrap items-center gap-x-2.5 gap-y-1">
                <WordChip
                  word={word.text}
                  saved={saver.isSaved('word', i)}
                  saving={saver.isSaving('word', i)}
                  onSave={() => void saver.save('word', i)}
                />
                <Text variant="small" tone="muted" className="shrink">
                  {word.meaning}
                </Text>
              </View>
              {word.example ? (
                <Text variant="langBody" tone="muted">
                  {word.example}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
        <SaveFailure code={saver.failure('word')} />
      </View>
    </Section>
  );
}

/**
 * A word to keep, as a pill in the serif of the language learned: soft with a plus while it can
 * be saved, ink with a tick once it is a card (then it is no longer a control).
 */
function WordChip({
  word,
  saved,
  saving,
  onSave,
}: {
  word: string;
  saved: boolean;
  saving: boolean;
  onSave: () => void;
}) {
  const { t } = useTranslation();
  const { color } = useTheme();
  if (saved) {
    return (
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={t('report.save.savedLabel', { word })}
        className="min-h-tap flex-row items-center gap-1.5 rounded-pill bg-inverse px-3.5 py-1.5"
      >
        <SavedTickOn />
        <Text variant="langBody" tone="onInverse">
          {word}
        </Text>
      </View>
    );
  }
  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={t('report.save.wordLabel', { word })}
      accessibilityState={{ disabled: saving }}
      disabled={saving}
      onPress={onSave}
    >
      <View
        className={`min-h-tap flex-row items-center gap-1.5 rounded-pill bg-surface px-3.5 py-1.5 ${saving ? 'opacity-disabled' : ''}`}
      >
        <Icon name="plus" color={color.fg} size={size.icon} strokeWidth={2.4} />
        <Text variant="langBody">{word}</Text>
      </View>
    </PressScale>
  );
}

/** The tick on an ink pill: pops in where a card was just made. */
function SavedTickOn() {
  const { color } = useTheme();
  return (
    <Pop>
      <Icon name="check" color={color.onInverse} size={size.icon} strokeWidth={2.6} />
    </Pop>
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
