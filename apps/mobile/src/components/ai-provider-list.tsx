import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import type { AiConsentChoices } from '@/auth';
import { Icon, type IconName } from '@/components/icon';
import { Switch } from '@/components/switch';
import { Text } from '@/components/text';
import { useTheme } from '@/theme';

/** The AI providers Konvami names to the learner. Company names are never translated. */
export const AI_PROVIDER = {
  openai: 'OpenAI',
  elevenlabs: 'ElevenLabs',
  bedrock: 'AWS Bedrock',
} as const;

type Provider = keyof typeof AI_PROVIDER;

/** What each provider is for and receives. OpenAI runs the conversation itself, so it is required. */
const PROVIDERS: readonly { id: Provider; icon: IconName; required: boolean }[] = [
  { id: 'openai', icon: 'mic', required: true },
  { id: 'elevenlabs', icon: 'volume', required: false },
  { id: 'bedrock', icon: 'file', required: false },
];

/**
 * Each AI provider with what it is for, what it receives, and a switch (Apple guideline
 * 5.1.2(i), GDPR). The required one is shown switched on and locked.
 */
export function AiProviderList({
  choices,
  onChange,
  disabled = false,
}: {
  choices: AiConsentChoices;
  onChange: (choices: AiConsentChoices) => void;
  /** While a choice is being stored. */
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const { color } = useTheme();
  return (
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
                value={choices[id as keyof AiConsentChoices]}
                locked={disabled}
                onValueChange={(on) => onChange({ ...choices, [id]: on })}
              />
            )}
          </View>
        );
      })}
    </View>
  );
}
