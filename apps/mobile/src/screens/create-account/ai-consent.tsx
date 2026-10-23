import { useState } from 'react';
import { View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { authErrorCode, generalErrorKey, useAuthServices, useSession } from '@/auth';
import { AiProviderList } from '@/components/ai-provider-list';
import { Button } from '@/components/button';
import { Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { StepHeader } from '@/components/step-header';
import { StepLayout } from '@/components/step-layout';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { openLegal } from '@/lib/external';
import { commitFeedback } from '@/lib/haptics';
import { microphoneAllowed } from '@/lib/microphone';
import { staggerDelay } from '@/lib/motion';
import { ROUTES } from '@/lib/routes';
import { SIGN_UP_STEPS } from './steps';

/**
 * 2.5 AI data consent (Apple guideline 5.1.2(i), GDPR): names each AI provider, what it receives
 * and why, before any data is sent. The choices are stored on the account with their date.
 */
export function AiConsentScreen() {
  const { t, i18n } = useTranslation();
  const { session } = useAuthServices();
  const { status } = useSession();
  // Optional providers start switched on, as on the approved design (spec open item O1).
  const [choices, setChoices] = useState({ elevenlabs: true, bedrock: true });
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  // Consent belongs to an account: without one there is nothing to agree to yet.
  if (status !== 'signedIn') return <Redirect href={ROUTES.welcome} />;

  async function agree() {
    commitFeedback();
    setProblem(null);
    setSaving(true);
    try {
      await session.saveAiConsent(choices);
      // The phone remembers the microphone answer: someone who already allowed it is not asked again.
      router.push((await microphoneAllowed()) ? ROUTES.allSet : ROUTES.microphone);
    } catch (error) {
      setProblem(t(generalErrorKey(authErrorCode(error))));
    } finally {
      setSaving(false);
    }
  }

  return (
    <StepLayout
      header={
        <StepHeader
          step={SIGN_UP_STEPS.consent}
          total={SIGN_UP_STEPS.total}
          // The email is verified, so there is no step to go back to: Back leaves the flow. The
          // user stays signed in and "Get started" brings them back here.
          onBack={() => router.replace(ROUTES.welcome)}
        />
      }
      actions={
        <>
          {problem ? (
            <View className="pb-2">
              <NoticeBox icon="info" tone="danger">
                {problem}
              </NoticeBox>
            </View>
          ) : null}
          <Button label={t('aiConsent.agree')} loading={saving} onPress={agree} />
          <TextButton
            tone="primary"
            label={t('aiConsent.readNotice')}
            onPress={() => openLegal('privacy', i18n.language)}
          />
        </>
      }
    >
      <Reveal>
        <View className="gap-2">
          <Text variant="title" accessibilityRole="header">
            {t('aiConsent.title')}
          </Text>
          <Text variant="bodySmall" tone="muted">
            {t('aiConsent.body')}
          </Text>
        </View>
      </Reveal>

      <Reveal delay={staggerDelay(1)}>
        <AiProviderList choices={choices} onChange={setChoices} />
      </Reveal>

      <Reveal delay={staggerDelay(2)}>
        <NoticeBox icon="info">{t('aiConsent.notice')}</NoticeBox>
      </Reveal>
    </StepLayout>
  );
}
