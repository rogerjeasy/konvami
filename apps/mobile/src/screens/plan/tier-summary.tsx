import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import type { Plan } from '@konvami/api-client';
import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import { useTheme } from '@/theme';

type TierInfo = Plan['tiers'][number];

/** Voice minutes a week as the learner reads them (the server counts seconds). */
const SECONDS_PER_MINUTE = 60;

/**
 * What a plan includes, as a short list: voice minutes a week, how many partners, and the
 * extras. Everything comes from the server's description of the tier, never from the app.
 */
export function TierSummary({ info }: { info: TierInfo }) {
  const { t } = useTranslation();
  const { color } = useTheme();
  const lines = [
    t('plan.minutesPerWeek', { count: Math.round(info.weeklySeconds / SECONDS_PER_MINUTE) }),
    info.personas === null
      ? t('plan.partnersAny')
      : t('plan.partnersLimit', { count: info.personas }),
    ...info.perks.map((perk) => t(`plan.perks.${perk}`)),
  ];
  return (
    <View className="gap-1.5">
      {lines.map((line) => (
        <View key={line} className="flex-row items-start gap-2">
          <View className="pt-0.5">
            <Icon name="check" size={size.iconSm} color={color.primaryText} />
          </View>
          <Text variant="small" className="flex-1">
            {line}
          </Text>
        </View>
      ))}
    </View>
  );
}
