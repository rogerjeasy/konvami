import { useState } from 'react';
import { ScrollView, useWindowDimensions, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { FlagKind, FlagReason } from '@konvami/api-client';
import { apiErrorCode } from '@/api/messages';
import { Button } from '@/components/button';
import { NoticeBox } from '@/components/notice-box';
import { OptionCard } from '@/components/option-card';
import { Sheet } from '@/components/sheet';
import { Text } from '@/components/text';
import { TextField } from '@/components/text-field';
import { successFeedback } from '@/lib/haptics';

/** What each kind can be reported for, in the order they are offered (as on the server). */
const REASONS: Record<FlagKind, readonly FlagReason[]> = {
  turn: ['wrong', 'offensive', 'other'],
  correction: ['wrong', 'not_said', 'offensive', 'other'],
};

/**
 * The share of the window the form may take before it scrolls, so the title and the send button
 * stay on screen on a small phone, in German, or at a large text size.
 */
const FORM_MAX_HEIGHT_SHARE = 0.55;

/** The longest note the server takes. */
const MAX_NOTE_LENGTH = 500;

/** Why a report could not be sent, as the sheet says it; any other reason reads "unavailable". */
function failureKey(code: string) {
  if (code === 'flag_limit') return 'flag.failed.limit';
  if (code === 'network') return 'errors.network';
  return 'flag.failed.unavailable';
}

/**
 * Reporting a partner's line or a correction (spec §16.1, Google Play's AI-content policy): the
 * reason, an optional note and the way to send it. The sheet says what is sent, so the report is
 * no surprise. Afterwards it thanks the learner; `hides` adds that the item is not shown again.
 * `kind` is null while it is closed.
 */
export function FlagSheet({
  kind,
  hides = false,
  onSend,
  onClose,
}: {
  kind: FlagKind | null;
  /** The reported item disappears afterwards (a hint the second check could not confirm). */
  hides?: boolean;
  /** Sends the report. Rejects with an `ApiError`; the sheet shows why and stays open. */
  onSend: (reason: FlagReason, note: string) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState<FlagReason | null>(null);
  const [note, setNote] = useState('');
  const [step, setStep] = useState<'form' | 'sending' | 'sent'>('form');
  const [failure, setFailure] = useState<string | null>(null);
  const { height } = useWindowDimensions();

  /** Closes the sheet; the next one opened starts afresh. */
  function close() {
    onClose();
    setReason(null);
    setNote('');
    setStep('form');
    setFailure(null);
  }

  async function send() {
    if (!reason) return;
    setStep('sending');
    setFailure(null);
    try {
      await onSend(reason, note);
      successFeedback();
      setStep('sent');
    } catch (error) {
      setFailure(apiErrorCode(error));
      setStep('form');
    }
  }

  return (
    <Sheet visible={kind !== null} title={t('flag.title')} onClose={close}>
      {step === 'sent' ? (
        <View className="gap-4 pt-1" accessibilityLiveRegion="polite">
          <Text variant="heading" accessibilityRole="header">
            {t('flag.sent')}
          </Text>
          <Text tone="muted">{t('flag.sentBody')}</Text>
          {hides ? <Text tone="muted">{t('flag.sentHidden')}</Text> : null}
          <Button label={t('flag.done')} onPress={close} />
        </View>
      ) : (
        <View className="gap-4 pt-1">
          <ScrollView
            style={{ maxHeight: height * FORM_MAX_HEIGHT_SHARE }}
            keyboardShouldPersistTaps="handled"
          >
            <View className="gap-4">
              <Text tone="muted">
                {t(kind === 'correction' ? 'flag.correctionQuestion' : 'flag.lineQuestion')}
              </Text>
              <View accessibilityRole="radiogroup" className="gap-2">
                {REASONS[kind ?? 'turn'].map((one) => (
                  <OptionCard
                    key={one}
                    role="radio"
                    label={t(`flag.reasons.${one}`)}
                    selected={reason === one}
                    onPress={() => setReason(one)}
                  />
                ))}
              </View>
              <TextField
                label={t('flag.note')}
                value={note}
                onChangeText={setNote}
                maxLength={MAX_NOTE_LENGTH}
                multiline
              />
              <Text variant="small" tone="subtle">
                {t('flag.privacy')}
              </Text>
            </View>
          </ScrollView>
          {failure ? (
            <NoticeBox icon="alert" tone="danger">
              {t(failureKey(failure))}
            </NoticeBox>
          ) : null}
          <Button
            label={t('flag.send')}
            disabled={reason === null}
            loading={step === 'sending'}
            onPress={() => void send()}
          />
        </View>
      )}
    </Sheet>
  );
}
