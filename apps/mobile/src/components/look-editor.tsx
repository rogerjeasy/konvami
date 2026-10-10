import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { avatar } from '@konvami/design-tokens';
import type { PersonaLook } from '@konvami/api-client';
import { HAIR_STYLES } from '@/components/avatar/look';
import { ChoiceChip } from '@/components/choice-chip';
import { ChoiceGroup, ToggleRow } from '@/components/choice-group';
import { Swatch } from '@/components/swatch';
import { stepFeedback } from '@/lib/haptics';

const keysOf = <T extends object>(palette: T) => Object.keys(palette) as (keyof T & string)[];
const SKINS = keysOf(avatar.skin);
const HAIR_COLORS = keysOf(avatar.hair);
const TOPS = keysOf(avatar.top);
const BACKDROPS = keysOf(avatar.backdrop);

/**
 * The parts and colors of a partner's portrait (spec §6.20), each a group of choices. The
 * portrait itself is drawn by the screen, which shows it following every choice.
 */
export function LookEditor({
  look,
  onChange,
}: {
  look: PersonaLook;
  onChange: (look: PersonaLook) => void;
}) {
  const { t } = useTranslation();
  const choose = (change: Partial<PersonaLook>) => {
    stepFeedback();
    onChange({ ...look, ...change });
  };
  const setLook = (update: (current: PersonaLook) => PersonaLook) => onChange(update(look));
  return (
    <View className="gap-4">
      <ChoiceGroup label={t('onboarding.partner.skin')}>
        {SKINS.map((skin) => (
          <Swatch
            key={skin}
            label={t(`onboarding.partner.skins.${skin}`)}
            color={avatar.skin[skin].base}
            selected={look.skin === skin}
            onPress={() => choose({ skin })}
          />
        ))}
      </ChoiceGroup>
      <ChoiceGroup chips label={t('onboarding.partner.hair')}>
        {HAIR_STYLES.map((hair) => (
          <ChoiceChip
            key={hair}
            label={t(`onboarding.partner.hairs.${hair}`)}
            selected={look.hair === hair}
            onPress={() => choose({ hair })}
          />
        ))}
      </ChoiceGroup>
      <ChoiceGroup label={t('onboarding.partner.hairColor')}>
        {HAIR_COLORS.map((hairColor) => (
          <Swatch
            key={hairColor}
            label={t(`onboarding.partner.hairColors.${hairColor}`)}
            color={avatar.hair[hairColor]}
            selected={look.hairColor === hairColor}
            onPress={() => choose({ hairColor })}
          />
        ))}
      </ChoiceGroup>
      <ChoiceGroup label={t('onboarding.partner.top')}>
        {TOPS.map((top) => (
          <Swatch
            key={top}
            label={t(`onboarding.partner.tops.${top}`)}
            color={avatar.top[top]}
            selected={look.top === top}
            onPress={() => choose({ top })}
          />
        ))}
      </ChoiceGroup>
      <ChoiceGroup label={t('onboarding.partner.backdrop')}>
        {BACKDROPS.map((backdrop) => (
          <Swatch
            key={backdrop}
            label={t(`onboarding.partner.backdrops.${backdrop}`)}
            color={avatar.backdrop[backdrop]}
            selected={look.backdrop === backdrop}
            onPress={() => choose({ backdrop })}
          />
        ))}
      </ChoiceGroup>
      <View>
        <ToggleRow
          label={t('onboarding.partner.glasses')}
          value={look.glasses}
          onChange={(glasses) => setLook((current) => ({ ...current, glasses }))}
        />
        <ToggleRow
          label={t('onboarding.partner.beard')}
          value={look.beard}
          onChange={(beard) => setLook((current) => ({ ...current, beard }))}
        />
      </View>
    </View>
  );
}
