import { View } from 'react-native';
import { size } from '@konvami/design-tokens';
import { Badge } from '@/components/badge';
import { Icon, type IconName } from '@/components/icon';
import { PressScale } from '@/components/motion';
import { Text } from '@/components/text';
import { useTheme, type ColorToken } from '@/theme';

/** The colour blob behind a row's icon, one per kind of practice (v4: each feature owns a colour). */
const BLOB = {
  tomato: { box: 'bg-tomato', ink: 'onTomato' },
  forest: { box: 'bg-forest', ink: 'lime' },
  butter: { box: 'bg-butter', ink: 'onButter' },
  pink: { box: 'bg-pink', ink: 'onPink' },
  ink: { box: 'bg-inverse', ink: 'inverseAccent' },
} as const satisfies Record<string, { box: string; ink: ColorToken }>;

export type BlobColor = keyof typeof BLOB;

// The blob is a rounded square a little larger than a touch target (pt, as on the prototype).
const BLOB_SIZE = 50;

/** One way to practise on Talk: a colour blob, a name, a line under it, a chevron. */
export function ModeRow({
  icon,
  blob,
  title,
  detail,
  badge,
  onPress,
}: {
  icon: IconName;
  blob: BlobColor;
  title: string;
  detail: string;
  badge?: string;
  onPress: () => void;
}) {
  const { color } = useTheme();
  const look = BLOB[blob];
  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={detail}
      onPress={onPress}
    >
      <View className="min-h-button flex-row items-center gap-3.5 rounded-card border border-border bg-chip p-3.5">
        <View
          aria-hidden
          style={{ width: BLOB_SIZE, height: BLOB_SIZE }}
          className={`items-center justify-center rounded-field ${look.box}`}
        >
          <Icon name={icon} color={color[look.ink]} size={size.iconLg} />
        </View>
        <View className="flex-1 gap-0.5">
          <View className="flex-row flex-wrap items-center gap-2">
            <Text variant="heading" className="shrink">
              {title}
            </Text>
            {badge ? <Badge label={badge} tone="chip" /> : null}
          </View>
          <Text variant="small" tone="subtle">
            {detail}
          </Text>
        </View>
        <Icon name="chevronRight" color={color.fgSubtle} size={size.iconMd} />
      </View>
    </PressScale>
  );
}
