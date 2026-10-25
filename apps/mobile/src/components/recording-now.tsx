import { View } from 'react-native';
import { size } from '@konvami/design-tokens';
import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { Pill } from '@/components/pill';
import { Text } from '@/components/text';
import { useTheme } from '@/theme';

/** While a sentence is being recorded: that the microphone listens, what to do, and Stop. */
export function RecordingNow({
  label,
  hint,
  stopLabel,
  onStop,
}: {
  label: string;
  hint: string;
  stopLabel: string;
  onStop: () => void;
}) {
  const { color } = useTheme();
  return (
    <View className="gap-3">
      <View accessibilityLiveRegion="polite" className="items-center gap-2">
        {/* A pill keeps to its own width at the start of a column; the row centres it. */}
        <View className="flex-row justify-center">
          <Pill
            tone="primary"
            label={label}
            leading={<Icon name="mic" color={color.primaryText} size={size.iconSm} />}
          />
        </View>
        <Text variant="small" tone="muted" className="text-center">
          {hint}
        </Text>
      </View>
      <Button label={stopLabel} onPress={onStop} />
    </View>
  );
}
