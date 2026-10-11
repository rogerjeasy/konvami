import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import { Card } from '@/components/card';
import { ChoiceChip } from '@/components/choice-chip';
import { DateChoice } from '@/components/date-choice';
import { Icon, type IconName } from '@/components/icon';
import { Reveal } from '@/components/motion';
import { OptionCard } from '@/components/option-card';
import { Text } from '@/components/text';
import { TextField } from '@/components/text-field';
import { addMonths, calendarDateOf } from '@/lib/dates';
import { stepFeedback } from '@/lib/haptics';
import { staggerDelay } from '@/lib/motion';
import type { CefrLevel, GoalReason } from '@/onboarding/essentials';
import { languageInText } from '@/onboarding/names';
import type { OnboardingData } from '@/onboarding/store';
import { useTheme } from '@/theme';
import { StepFrame, StepGate } from './step';

const REASON_ICON: Record<GoalReason, IconName> = {
  travel: 'compass',
  work: 'briefcase',
  study: 'book',
  exam: 'award',
  living_abroad: 'home',
  family_friends: 'users',
  culture: 'film',
  other: 'plusCircle',
};

// The exam the pack does not list (services/api: OTHER_EXAM): any level is possible.
const OTHER_EXAM = 'other';
// The longest note the profile accepts (services/api: GOAL_NOTE_MAX).
const NOTE_MAX = 280;
// Reasons are laid out in rows of this many cards.
const COLUMNS = 2;
// The date wheels open this many months from today and offer this many years ahead.
const DATE_START_MONTHS_AHEAD = 1;
const DATE_YEARS_AHEAD = 5;

function rowsOf<T>(items: readonly T[], width: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / width) }, (_, row) =>
    items.slice(row * width, (row + 1) * width),
  );
}

function GoalsForm({ data, today }: { data: OnboardingData; today: Date }) {
  const { t } = useTranslation();
  const { color } = useTheme();
  const { catalog, essentials } = data;
  const exams =
    catalog.languages.find(({ code }) => code === essentials.targetLanguage)?.exams ?? [];
  const earliest = calendarDateOf(today);

  const [reasons, setReasons] = useState<GoalReason[]>(essentials.goals?.reasons ?? []);
  const [note, setNote] = useState(essentials.goals?.note ?? '');
  const [examType, setExamType] = useState(essentials.exam?.type ?? null);
  const [examLevel, setExamLevel] = useState<CefrLevel | null>(
    essentials.exam?.targetLevel ?? null,
  );
  const [examDate, setExamDate] = useState(essentials.exam?.date ?? null);

  const wantsExam = reasons.includes('exam');
  const levels =
    examType === null
      ? []
      : (exams.find(({ id }) => id === examType)?.levels ?? catalog.examLevels);

  const toggle = (reason: GoalReason) => {
    stepFeedback();
    setReasons((current) =>
      current.includes(reason) ? current.filter((r) => r !== reason) : [...current, reason],
    );
  };

  const chooseExam = (type: string) => {
    stepFeedback();
    setExamType(type);
    // A level the newly chosen exam does not have cannot stay selected.
    const offered = exams.find(({ id }) => id === type)?.levels ?? catalog.examLevels;
    setExamLevel((current) => (current && offered.includes(current) ? current : null));
  };

  return (
    <StepFrame
      step="goals"
      title={t('onboarding.goals.title', {
        language: languageInText(catalog, essentials.targetLanguage ?? '', t),
      })}
      body={t('onboarding.goals.body')}
      complete={reasons.length > 0 && (!wantsExam || examType !== null)}
      changes={() => [
        {
          field: 'goals',
          // In the catalog's order, whatever order they were tapped in.
          value: {
            reasons: catalog.goalReasons.filter((reason) => reasons.includes(reason)),
            note: note.trim() || null,
          },
        },
        {
          field: 'exam',
          value: wantsExam ? { type: examType, target_level: examLevel, date: examDate } : null,
        },
      ]}
    >
      <Reveal delay={staggerDelay(1)}>
        <View className="gap-2.5">
          {rowsOf(catalog.goalReasons, COLUMNS).map((row) => (
            <View key={row.join()} className="flex-row gap-2.5">
              {row.map((reason) => {
                const selected = reasons.includes(reason);
                return (
                  <OptionCard
                    key={reason}
                    compact
                    role="checkbox"
                    label={t(`onboarding.goals.reasons.${reason}`)}
                    leading={
                      <Icon
                        name={REASON_ICON[reason]}
                        color={selected ? color.primaryText : color.fgMuted}
                        size={size.iconLg}
                        strokeWidth={1.8}
                      />
                    }
                    selected={selected}
                    onPress={() => toggle(reason)}
                  />
                );
              })}
            </View>
          ))}
        </View>
      </Reveal>

      {wantsExam ? (
        <Reveal>
          <Card className="gap-4 bg-surface p-4">
            <View className="gap-2.5">
              <Text variant="heading" accessibilityRole="header">
                {t('onboarding.goals.examTitle')}
              </Text>
              <View accessibilityRole="radiogroup" className="flex-row flex-wrap gap-2">
                {[...exams, { id: OTHER_EXAM, name: t('onboarding.goals.examOther') }].map(
                  ({ id, name }) => (
                    <ChoiceChip
                      key={id}
                      label={name}
                      selected={examType === id}
                      onPress={() => chooseExam(id)}
                    />
                  ),
                )}
              </View>
            </View>

            {examType ? (
              <Reveal>
                <View className="gap-4">
                  <View className="gap-2.5">
                    <Text variant="fieldLabel">{t('onboarding.goals.examLevel')}</Text>
                    <View accessibilityRole="radiogroup" className="flex-row flex-wrap gap-2">
                      {levels.map((level) => (
                        <ChoiceChip
                          key={level}
                          label={level}
                          selected={examLevel === level}
                          onPress={() => {
                            stepFeedback();
                            setExamLevel(level);
                          }}
                        />
                      ))}
                    </View>
                  </View>

                  <View className="gap-2.5">
                    <Text variant="fieldLabel">{t('onboarding.goals.examDate')}</Text>
                    <DateChoice
                      value={examDate}
                      onChange={setExamDate}
                      opensOn={addMonths(earliest, DATE_START_MONTHS_AHEAD)}
                      min={earliest}
                      years={{ from: earliest.year, to: earliest.year + DATE_YEARS_AHEAD }}
                      labels={{
                        add: t('onboarding.goals.addDate'),
                        change: t('onboarding.goals.changeDate'),
                        remove: t('onboarding.goals.removeDate'),
                        title: t('onboarding.goals.dateTitle'),
                        confirm: t('onboarding.goals.setDate'),
                      }}
                    />
                  </View>
                </View>
              </Reveal>
            ) : null}
          </Card>
        </Reveal>
      ) : null}

      <Reveal delay={staggerDelay(2)}>
        <TextField
          label={t('onboarding.goals.note')}
          placeholder={t('onboarding.goals.notePlaceholder')}
          value={note}
          onChangeText={setNote}
          maxLength={NOTE_MAX}
          multiline
        />
      </Reveal>
    </StepFrame>
  );
}

/**
 * 4.2 · Step 3: why the learner is learning, and the exam they prepare for if there is one
 * (spec D3). `today` is injectable for tests; an exam date is never before it.
 */
export function GoalsStep({ today: givenToday }: { today?: Date }) {
  // Read once, so the earliest date cannot move under the user at midnight.
  const [today] = useState(() => givenToday ?? new Date());
  return <StepGate step="goals">{(data) => <GoalsForm data={data} today={today} />}</StepGate>;
}
