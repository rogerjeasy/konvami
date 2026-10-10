import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import type { PersonaLook, PersonaRole } from '@konvami/api-client';
import { Badge } from '@/components/badge';
import { PersonaAvatar } from '@/components/persona-avatar';
import { Text } from '@/components/text';

/**
 * A partner in a few lines: their portrait, name and role, age and origin, and one line about
 * them (their own, or their role's when they have none). `children` adds lines under it.
 */
export function PersonaSummary({
  persona,
  diameter = size.avatarLg,
  children,
}: {
  persona: {
    look: PersonaLook;
    name: string;
    role: PersonaRole;
    age: number;
    origin: string;
    tagline: string | null;
  };
  diameter?: number;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <View className="flex-row items-start gap-3.5">
      <PersonaAvatar look={persona.look} diameter={diameter} />
      <View className="flex-1 gap-1">
        <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
          <Text variant="heading" className="shrink">
            {persona.name}
          </Text>
          <Badge label={t(`onboarding.partners.roles.${persona.role}`)} />
        </View>
        <Text variant="small" tone="subtle">
          {t('onboarding.partners.ageOrigin', { age: persona.age, origin: persona.origin })}
        </Text>
        <Text variant="callout" tone="muted">
          {persona.tagline ?? t(`onboarding.partners.roleLines.${persona.role}`)}
        </Text>
        {children}
      </View>
    </View>
  );
}
