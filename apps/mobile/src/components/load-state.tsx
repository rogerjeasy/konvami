import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Button } from '@/components/button';
import { Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { Text } from '@/components/text';
import { useTheme } from '@/theme';

// After this long (ms) a wait gets an explanation, so a slow start does not look like a freeze.
const SLOW_AFTER_MS = 3000;

/** The waiting note. It mounts anew for every wait, so the slow hint starts hidden each time. */
function Loading({ label, slowLabel }: { label: string; slowLabel: string }) {
  const { color } = useTheme();
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityLiveRegion="polite"
      className="flex-1 items-center justify-center gap-3 py-10"
    >
      <ActivityIndicator color={color.primary} />
      <Text variant="labelMedium" tone="muted" className="text-center">
        {label}
      </Text>
      {slow ? (
        <Reveal>
          <Text variant="small" tone="subtle" className="text-center">
            {slowLabel}
          </Text>
        </Reveal>
      ) : null}
    </View>
  );
}

/**
 * What a screen shows while its data is loading or after loading failed. Loading says what is
 * happening and, when it takes long, why; a failure says so and offers to try again.
 */
export function LoadState({
  failed,
  loadingLabel,
  slowLabel,
  failedLabel,
  retryLabel,
  onRetry,
}: {
  failed: boolean;
  loadingLabel: string;
  /** Shown under the label when loading takes longer than a few seconds. */
  slowLabel: string;
  failedLabel: string;
  retryLabel: string;
  onRetry: () => void;
}) {
  if (!failed) return <Loading label={loadingLabel} slowLabel={slowLabel} />;
  return (
    // In the same place as the waiting note it replaces.
    <View className="flex-1 justify-center py-10">
      <Reveal>
        <View className="gap-4">
          <NoticeBox icon="alert" tone="danger">
            {failedLabel}
          </NoticeBox>
          <Button variant="secondary" label={retryLabel} onPress={onRetry} />
        </View>
      </Reveal>
    </View>
  );
}
