import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { TextField } from '@/components/text-field';
import { buildExercises, matchesExample } from '@/lib/grammar-exercise';
import { commitFeedback } from '@/lib/haptics';

/** Model-example practice stays separate from mastery, which requires conversational evidence. */
export function GrammarPractice({ examples }: { examples: readonly string[] }) {
  const { t } = useTranslation();
  const exercises = useMemo(() => buildExercises(examples), [examples]);
  const [position, setPosition] = useState<number | null>(null);
  const [answer, setAnswer] = useState('');
  const [chosen, setChosen] = useState<number[]>([]);
  const [checked, setChecked] = useState(false);
  const exercise = position === null ? undefined : exercises[position];
  const value =
    exercise?.kind === 'order' ? chosen.map((index) => exercise.words[index]).join(' ') : answer;

  function next(index: number) {
    commitFeedback();
    setPosition(index);
    setAnswer('');
    setChosen([]);
    setChecked(false);
  }

  if (!exercises.length) return null;
  return (
    <Card className="gap-3 p-4">
      <Text variant="heading" accessibilityRole="header">
        {t('grammar.practice.practiceTitle')}
      </Text>
      <Text variant="small" tone="muted">
        {t('grammar.practice.practiceHint')}
      </Text>
      {position === null ? (
        <Button
          variant="secondary"
          label={t('grammar.practice.startPractice')}
          onPress={() => next(0)}
        />
      ) : !exercise ? (
        <>
          <Text tone="primary">{t('grammar.practice.finished')}</Text>
          <Button
            variant="secondary"
            label={t('grammar.practice.restart')}
            onPress={() => next(0)}
          />
        </>
      ) : (
        <>
          <Text variant="label">{t(`grammar.practice.${exercise.kind}`)}</Text>
          {exercise.kind === 'cloze' ? (
            <>
              <Text>{exercise.prompt}</Text>
              <TextField
                label={t('grammar.practice.answer')}
                value={answer}
                onChangeText={setAnswer}
                editable={!checked}
              />
            </>
          ) : (
            <>
              <Text>{value || '…'}</Text>
              <View className="flex-row flex-wrap gap-2">
                {exercise.words.map((word, index) => (
                  <TextButton
                    key={index}
                    label={word}
                    disabled={checked || chosen.includes(index)}
                    onPress={() => {
                      commitFeedback();
                      setChosen((current) => [...current, index]);
                    }}
                  />
                ))}
              </View>
              {!checked ? (
                <TextButton label={t('grammar.practice.reset')} onPress={() => setChosen([])} />
              ) : null}
            </>
          )}
          {checked ? (
            <>
              <Text tone={matchesExample(value, exercise.answer) ? 'primary' : 'muted'}>
                {t(
                  matchesExample(value, exercise.answer)
                    ? 'grammar.practice.matched'
                    : 'grammar.practice.compare',
                )}
              </Text>
              <Text>{exercise.example}</Text>
              <Button
                variant="secondary"
                label={t('grammar.practice.next')}
                onPress={() => next(position + 1)}
              />
            </>
          ) : (
            <Button
              variant="secondary"
              label={t('grammar.practice.check')}
              disabled={!value.trim()}
              onPress={() => {
                commitFeedback();
                setChecked(true);
              }}
            />
          )}
        </>
      )}
    </Card>
  );
}
