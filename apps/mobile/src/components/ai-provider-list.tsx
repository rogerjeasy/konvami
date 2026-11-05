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
  elevenlabs: 'ElevenLabs',
} as const;

type Provider = keyof typeof AI_PROVIDER;

/**
 * The providers that receive learners' data, each with what it is for. Only providers in use are
 * named (decided 2026-10-23). OpenAI is required. ElevenLabs (consent text v3, 2026-11-06) is
 * optional and named only where the server offers it (`elevenlabs`); it is off until turned on.
 * Bedrock comes back with a new consent version once it is integrated.
 */
const REQUIRED: readonly { id: Provider; icon: IconName }[] = [{ id: 'openai', icon: 'mic' }];

/** The learner's choice about ElevenLabs; leave it out where the server does not offer it. */
export interface OptionalProviderChoice {
  on: boolean;
  /** While the choice is being saved. */
  locked?: boolean;
  onChange: (on: boolean) => void;
}

function ProviderRow({
  id,
  icon,
  first,
  required,
  choice,
}: {
  id: Provider;
  icon: IconName;
  first: boolean;
  required: boolean;
  choice?: OptionalProviderChoice;
}) {
  const { t } = useTranslation();
  const { color } = useTheme();
  const name = AI_PROVIDER[id];
  return (
    <View className={`flex-row items-center gap-3 p-3.5 ${first ? '' : 'border-t border-border'}`}>
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
              {t(required ? 'common.required' : 'aiConsent.optional')}
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
          label={t(choice?.on ? 'aiConsent.optionalProvider' : 'aiConsent.optionalOff', { name })}
          value={choice?.on ?? false}
          locked={choice?.locked ?? false}
          onValueChange={(on) => choice?.onChange(on)}
        />
      )}
    </View>
  );
}

/**
 * Each AI provider with what it is for and what it receives (Apple guideline 5.1.2(i), GDPR).
 * Each required one has its switch shown on and locked; an optional one is the learner's choice.
 */
export function AiProviderList({ elevenlabs }: { elevenlabs?: OptionalProviderChoice }) {
  return (
    <View className="overflow-hidden rounded-card border border-border">
      {REQUIRED.map(({ id, icon }, i) => (
        <ProviderRow key={id} id={id} icon={icon} first={i === 0} required />
      ))}
      {elevenlabs ? (
        <ProviderRow
          id="elevenlabs"
          icon="volume"
          first={false}
          required={false}
          choice={elevenlabs}
        />
      ) : null}
    </View>
  );
}
