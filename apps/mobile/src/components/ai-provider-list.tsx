import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import { Icon, type IconName } from '@/components/icon';
import { Switch } from '@/components/switch';
import { Text } from '@/components/text';
import { useTheme } from '@/theme';

/** The AI providers Konvami names to the learner. Company names are never translated. */
export const AI_PROVIDER = {
  openai: 'OpenAI',
} as const;

type Provider = keyof typeof AI_PROVIDER;

/**
 * The providers that receive learners' data, each with what it is for. Only providers in use are
 * named (decided 2026-10-23): ElevenLabs and Bedrock come back with a new consent version
 * (`AI_CONSENT_VERSION`) once they are integrated.
 */
const PROVIDERS: readonly { id: Provider; icon: IconName }[] = [{ id: 'openai', icon: 'mic' }];

/**
 * Each AI provider with what it is for and what it receives (Apple guideline 5.1.2(i), GDPR).
 * Each is required: its switch is shown on and locked.
 */
export function AiProviderList() {
  const { t } = useTranslation();
  const { color } = useTheme();
  return (
    <View className="overflow-hidden rounded-card border border-border">
      {PROVIDERS.map(({ id, icon }, i) => {
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
                <View className="rounded-sm bg-surface px-1.5 py-1">
                  <Text variant="badge" tone="muted">
                    {t('common.required')}
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
            <Switch
              label={t('aiConsent.requiredProvider', { name })}
              value
              locked
              onValueChange={() => {}}
            />
          </View>
        );
      })}
    </View>
  );
}
