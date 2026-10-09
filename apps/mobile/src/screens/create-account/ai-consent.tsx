import { useState } from 'react';
import { View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import { authErrorCode, generalErrorKey, useAuthServices, useSession } from '@/auth';
import { Button } from '@/components/button';
import { Icon, type IconName } from '@/components/icon';
import { Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { StepHeader } from '@/components/step-header';
import { StepLayout } from '@/components/step-layout';
import { Switch } from '@/components/switch';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { openLegal } from '@/lib/external';
import { commitFeedback } from '@/lib/haptics';
import { microphoneAllowed } from '@/lib/microphone';
import { staggerDelay } from '@/lib/motion';
import { ROUTES } from '@/lib/routes';
import { useTheme } from '@/theme';
import { AI_PROVIDER } from './sample-content';
import { SIGN_UP_STEPS } from './steps';

type Provider = keyof typeof AI_PROVIDER;

/** What each provider is for and receives. OpenAI runs the conversation itself, so it is required. */
const PROVIDERS: readonly { id: Provider; icon: IconName; required: boolean }[] = [
  { id: 'openai', icon: 'mic', required: true },
  { id: 'elevenlabs', icon: 'volume', required: false },
  { id: 'bedrock', icon: 'file', required: false },
];

/**
 * 2.5 AI data consent (Apple guideline 5.1.2(i), GDPR): names each AI provider, what it receives
 * and why, before any data is sent. The choices are stored on the account with their date.
 */
export function AiConsentScreen() {
  const { t } = useTranslation();
  const { color } = useTheme();
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
            onPress={() => openLegal('privacy')}
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
        <View className="overflow-hidden rounded-card border border-border">
          {PROVIDERS.map(({ id, icon, required }, i) => {
            const name = AI_PROVIDER[id];
            return (
              <View
                key={id}
                className={`flex-row items-center gap-3 p-3.5 ${i > 0 ? 'border-t border-border' : ''}`}
              >
                <View
                  aria-hidden
                  style={{ width: size.avatarSm, height: size.avatarSm }}
                  className="items-center justify-center self-start rounded-md bg-surface"
                >
                  <Icon name={icon} color={color.fg} size={size.iconMd} />
                </View>
                <View className="flex-1 gap-1">
                  <View className="flex-row flex-wrap items-center gap-2">
                    <Text variant="labelMedium">{name}</Text>
                    <View
                      className={`rounded-sm px-1.5 py-1 ${required ? 'bg-surface' : 'bg-primary-soft'}`}
                    >
                      <Text variant="badge" tone={required ? 'muted' : 'primary'}>
                        {t(required ? 'common.required' : 'common.optional')}
                      </Text>
                    </View>
                  </View>
                  <Text variant="small" tone="muted">
                    {t(`aiConsent.${id}Purpose`)}
                  </Text>
                  <Text variant="caption" tone="subtle">
                    {t(`aiConsent.${id}Receives`)}
                  </Text>
                </View>
                {required ? (
                  <Switch
                    label={t('aiConsent.requiredProvider', { name })}
                    value
                    locked
                    onValueChange={() => {}}
                  />
                ) : (
                  <Switch
                    label={name}
                    value={choices[id as keyof typeof choices]}
                    onValueChange={(on) => setChoices((current) => ({ ...current, [id]: on }))}
                  />
                )}
              </View>
            );
          })}
        </View>
      </Reveal>

      <Reveal delay={staggerDelay(2)}>
        <NoticeBox icon="info">{t('aiConsent.notice')}</NoticeBox>
      </Reveal>
    </StepLayout>
  );
}
