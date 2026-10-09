import type { ReactNode } from 'react';
import { View } from 'react-native';
import { size } from '@konvami/design-tokens';
import { Icon, type IconName } from '@/components/icon';
import { Text, type TextTone } from '@/components/text';
import { useTheme, type ColorToken } from '@/theme';

const LOOK = {
  /** Neutral information. */
  surface: { box: 'bg-surface', tone: 'muted', icon: 'fgMuted' },
  /** A reassurance worth noticing (privacy). */
  primary: { box: 'bg-primary-soft', tone: 'primary', icon: 'primaryText' },
  /** Something went wrong and the user has to act. */
  danger: { box: 'border border-danger-border bg-danger-soft', tone: 'danger', icon: 'danger' },
} as const satisfies Record<string, { box: string; tone: TextTone; icon: ColorToken }>;

/**
 * A short note with an icon. `danger` is announced to screen readers when it appears. With a
 * `title`, the title carries the tone and the text under it explains (it may contain a link).
 */
export function NoticeBox({
  icon,
  tone = 'surface',
  title,
  children,
}: {
  icon: IconName;
  tone?: keyof typeof LOOK;
  title?: string;
  children: ReactNode;
}) {
  const { color } = useTheme();
  const look = LOOK[tone];
  const danger = tone === 'danger';
  return (
    <View
      role={danger ? 'alert' : undefined}
      accessibilityLiveRegion={danger ? 'polite' : undefined}
      className={`flex-row gap-3 rounded-button px-4 py-3 ${title ? 'items-start' : 'items-center'} ${look.box}`}
    >
      <Icon name={icon} color={color[look.icon]} size={size.iconMd} />
      <View className="flex-1 gap-1">
        {title ? (
          <Text variant="labelSmall" tone={danger ? 'dangerTitle' : look.tone}>
            {title}
          </Text>
        ) : null}
        <Text variant="callout" tone={title ? 'muted' : look.tone}>
          {children}
        </Text>
      </View>
    </View>
  );
}
