import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import type { Conversation } from '@konvami/api-client';
import { Icon } from '@/components/icon';
import { PressScale } from '@/components/motion';
import { PersonaAvatar } from '@/components/persona-avatar';
import { Text } from '@/components/text';
import { wholeMinutes } from '@/lib/format';
import { relativeDayLabel, relativeDayPhrase } from '@/lib/relative-day';
import { useTheme } from '@/theme';

// Stands between the parts of a row's second line ("Yesterday · 8 min").
const SEPARATOR = ' · ';

/**
 * One past conversation in a list (Today's recent ones, the library): who it was with, when
 * and for how long. The whole row opens it.
 */
export function ConversationRow({
  conversation,
  now,
  onPress,
}: {
  conversation: Conversation;
  /** The device's time, for "today" and "yesterday". */
  now: Date;
  onPress: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { color } = useTheme();
  const { partner, startedAt } = conversation;
  const name = partner?.name ?? t('conversations.formerPartner');
  const duration = t('time.minutes', { count: wholeMinutes(conversation.seconds) });
  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={t('conversations.rowLabel', {
        name,
        when: relativeDayPhrase(t, i18n.language, startedAt, now),
        duration,
      })}
      onPress={onPress}
    >
      <View className="min-h-tap flex-row items-center gap-3 py-2.5">
        {partner ? (
          <PersonaAvatar look={partner.look} diameter={size.avatarMd} />
        ) : (
          <View
            aria-hidden
            style={{ width: size.avatarMd, height: size.avatarMd }}
            className="items-center justify-center rounded-pill bg-surface"
          >
            <Icon name="user" color={color.fgSubtle} size={size.iconMd} />
          </View>
        )}
        <View className="flex-1 gap-0.5">
          <Text variant="label">{name}</Text>
          <Text variant="small" tone="subtle">
            {[relativeDayLabel(t, i18n.language, startedAt, now), duration].join(SEPARATOR)}
          </Text>
        </View>
        <Icon name="chevronRight" color={color.fgSubtle} size={size.iconMd} />
      </View>
    </PressScale>
  );
}
