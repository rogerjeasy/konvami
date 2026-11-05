import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { FeedbackCategory } from '@konvami/api-client';
import { track } from '@/analytics';
import { apiErrorCode } from '@/api/messages';
import { Button } from '@/components/button';
import { ChoiceChip } from '@/components/choice-chip';
import { ToggleRow } from '@/components/choice-group';
import { NoticeBox } from '@/components/notice-box';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { TextField } from '@/components/text-field';
import { deviceInfo } from '@/lib/device-info';
import { successFeedback } from '@/lib/haptics';
import { usePracticeServices } from '@/practice/services';

const CATEGORIES: readonly FeedbackCategory[] = ['bug', 'idea', 'other'];

/** The longest message the server takes. */
const MAX_MESSAGE_LENGTH = 2000;

/** Why a message could not be sent, as the form says it; any other reason reads "unavailable". */
function failureKey(code: string) {
  if (code === 'feedback_limit') return 'help.failedLimit';
  if (code === 'network') return 'errors.network';
  return 'help.failedUnavailable';
}

/**
 * The feedback form (spec §6.21.4): what it is about, the message, and whether to send the
 * device and app version along (off until the learner ticks it). Says what is not sent, so the
 * message is no surprise. Afterwards it thanks the learner and offers another.
 */
export function FeedbackForm() {
  const { t } = useTranslation();
  const { sendFeedback } = usePracticeServices();
  const [category, setCategory] = useState<FeedbackCategory>('bug');
  const [message, setMessage] = useState('');
  const [withDevice, setWithDevice] = useState(false);
  const [step, setStep] = useState<'form' | 'sending' | 'sent'>('form');
  const [failure, setFailure] = useState<string | null>(null);

  async function send() {
    setStep('sending');
    setFailure(null);
    try {
      await sendFeedback({
        category,
        message: message.trim(),
        device: withDevice ? deviceInfo() : null,
      });
      successFeedback();
      track('feedback_sent', { category });
      setStep('sent');
    } catch (error) {
      setFailure(apiErrorCode(error));
      setStep('form');
    }
  }

  if (step === 'sent') {
    return (
      <View className="gap-3" accessibilityLiveRegion="polite">
        <Text variant="heading" accessibilityRole="header">
          {t('help.sent')}
        </Text>
        <Text tone="muted">{t('help.sentBody')}</Text>
        <TextButton
          tone="primary"
          label={t('help.another')}
          onPress={() => {
            setMessage('');
            setStep('form');
          }}
        />
      </View>
    );
  }

  return (
    <View className="gap-4">
      <View className="gap-1.5">
        <Text variant="fieldLabel" aria-hidden>
          {t('help.category.label')}
        </Text>
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel={t('help.category.label')}
          className="flex-row flex-wrap gap-2 py-1"
        >
          {CATEGORIES.map((one) => (
            <ChoiceChip
              key={one}
              label={t(`help.category.${one}`)}
              selected={category === one}
              onPress={() => setCategory(one)}
            />
          ))}
        </View>
      </View>
      <TextField
        label={t('help.message')}
        value={message}
        onChangeText={setMessage}
        maxLength={MAX_MESSAGE_LENGTH}
        multiline
      />
      <View className="gap-1">
        <ToggleRow label={t('help.includeDevice')} value={withDevice} onChange={setWithDevice} />
        <Text variant="small" tone="subtle">
          {t('help.includeDeviceHint')}
        </Text>
      </View>
      <Text variant="small" tone="subtle">
        {t('help.privacy')}
      </Text>
      {failure ? (
        <NoticeBox icon="alert" tone="danger">
          {t(failureKey(failure))}
        </NoticeBox>
      ) : null}
      <Button
        label={t('help.send')}
        disabled={message.trim().length === 0}
        loading={step === 'sending'}
        onPress={() => void send()}
      />
    </View>
  );
}
