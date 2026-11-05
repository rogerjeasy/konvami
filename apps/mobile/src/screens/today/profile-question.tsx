import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import type { IconName } from '@/components/icon';
import { apiErrorCode, apiErrorKey } from '@/api/messages';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Icon } from '@/components/icon';
import { NoticeBox } from '@/components/notice-box';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { commitFeedback } from '@/lib/haptics';
import { useProfileQuestion, useProfileServices } from '@/profile/services';
import { useTheme } from '@/theme';

// The questions the server asks (services/api: domain/profile_questions.py), with their icons.
const ICONS: Record<string, IconName> = {
  recordings: 'volume',
  memory: 'file',
  weekly_habit: 'calendar',
};

/** Whether this app version has the words for a question. */
export const isKnownQuestion = (id: string) => id in ICONS;

/**
 * A question about a setting, asked when it becomes relevant (progressive profiling, spec §6.1.2)
 * instead of in onboarding: whether to keep the audio after the first conversation, whether
 * partners remember once they wrote something down, how often to practise. The server decides
 * which one is due and applies the answer; "Not now" brings it back once, a week later. A
 * question this app version has no words for is not shown.
 */
export function ProfileQuestion() {
  const { t } = useTranslation();
  const { color } = useTheme();
  const { question: store } = useProfileServices();
  const state = useProfileQuestion();
  const [sending, setSending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const due = state.phase === 'ready' ? state.data.question : null;
  if (!due || !isKnownQuestion(due.id)) return null;

  async function send(key: string, request: () => Promise<void>) {
    commitFeedback();
    setSending(key);
    setError(null);
    try {
      await request();
    } catch (failure) {
      setError(t(apiErrorKey(apiErrorCode(failure))));
    } finally {
      setSending(null);
    }
  }

  const prefix = `today.question.${due.id}` as 'today.question.memory';
  return (
    <Card className="gap-3 p-4">
      <View className="flex-row items-start gap-3">
        <View className="pt-0.5" aria-hidden>
          <Icon name={ICONS[due.id] ?? 'info'} color={color.primaryText} size={size.iconMd} />
        </View>
        <View className="flex-1 gap-1">
          <Text variant="label" accessibilityRole="header">
            {t(`${prefix}.title`)}
          </Text>
          <Text variant="small" tone="muted">
            {t(`${prefix}.body`)}
          </Text>
        </View>
      </View>
      <View className="gap-2">
        {due.options.map((option) => (
          <Button
            key={option}
            variant="secondary"
            label={t(`${prefix}.options.${option}` as 'today.question.memory.options.remember', {
              defaultValue: option,
            })}
            loading={sending === option}
            disabled={sending !== null && sending !== option}
            onPress={() => void send(option, () => store.answer(due.id, option))}
          />
        ))}
        <TextButton
          tone="primary"
          label={t('today.question.later')}
          disabled={sending !== null}
          onPress={() => void send('later', () => store.dismiss(due.id))}
        />
      </View>
      {error ? (
        <View accessibilityLiveRegion="polite">
          <NoticeBox icon="alert" tone="danger">
            {error}
          </NoticeBox>
        </View>
      ) : null}
    </Card>
  );
}
