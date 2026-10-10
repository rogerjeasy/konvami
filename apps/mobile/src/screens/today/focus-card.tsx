import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import { Card } from '@/components/card';
import { Icon } from '@/components/icon';
import { Pill } from '@/components/pill';
import { Text } from '@/components/text';
import { useTheme } from '@/theme';

// How many things to work on Today shows: the most useful ones, not a to-do list.
const SHOWN = 3;

/**
 * What the placement test found worth working on, most useful first. Amber and friendly, never
 * a red list of mistakes (spec §14.3 "zero shame").
 */
export function FocusCard({ focus }: { focus: readonly string[] }) {
  const { t } = useTranslation();
  const { color } = useTheme();
  return (
    <Card className="gap-3 p-4">
      <View className="gap-2">
        <Pill
          tone="warn"
          label={t('today.focus.title')}
          leading={<Icon name="edit" color={color.warnText} size={size.iconSm} />}
        />
        <Text variant="small" tone="subtle">
          {t('today.focus.body')}
        </Text>
      </View>
      <View className="gap-2.5">
        {focus.slice(0, SHOWN).map((area) => (
          <View key={area} className="flex-row items-start gap-2.5">
            <View className="pt-0.5">
              <Icon name="target" color={color.warnIcon} size={size.icon} />
            </View>
            <Text variant="callout" className="flex-1">
              {area}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  );
}
