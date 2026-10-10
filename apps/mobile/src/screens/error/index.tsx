import type { ReactNode } from 'react';
import { View } from 'react-native';
import { router, type ErrorBoundaryProps } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { space } from '@konvami/design-tokens';
import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { ErrorBoundary } from '@/components/error-boundary';
import { useScreenLayout } from '@/hooks/use-screen-layout';
import { ROUTES } from '@/lib/routes';
import { ThemeProvider } from '@/theme';

/**
 * What a learner sees when a screen has broken: that it happened, in plain words, and the ways
 * on. Never the error's own text or a trace; those are for developers.
 */
export function ScreenError({ onRetry, onLeave }: { onRetry: () => void; onLeave?: () => void }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { gutter } = useScreenLayout();
  return (
    <View
      className="flex-1 bg-bg"
      style={{
        paddingTop: insets.top + space.lg,
        paddingBottom: Math.max(insets.bottom, space.lg),
        paddingHorizontal: gutter,
      }}
    >
      <EmptyState
        icon="alert"
        title={t('screenError.title')}
        body={t('screenError.body')}
        action={
          <View className="gap-3">
            <Button label={t('common.retry')} onPress={onRetry} />
            {onLeave ? (
              <Button variant="secondary" label={t('screenError.home')} onPress={onLeave} />
            ) : null}
          </View>
        }
      />
    </View>
  );
}

/**
 * Keeps a broken screen from taking the app down with it: the learner gets `ScreenError` in its
 * place. `leave` adds the way back to the start of the app (the gate at `/home` decides where
 * that is); turn it off where the surroundings already offer a way out, as the tab bar does.
 */
export function ScreenBoundary({
  children,
  leave = true,
  resetKey,
}: {
  children: ReactNode;
  leave?: boolean;
  /** When this changes (another screen was opened), the screen is shown again. */
  resetKey?: string;
}) {
  return (
    <ErrorBoundary
      resetKey={resetKey}
      fallback={(retry) => (
        <ScreenError
          onRetry={retry}
          onLeave={leave ? () => router.replace(ROUTES.home) : undefined}
        />
      )}
    >
      {children}
    </ErrorBoundary>
  );
}

/**
 * The last line of defence, exported from the root layout as the router's `ErrorBoundary`: what
 * shows when the layout itself breaks (a provider, the navigator), where no screen is left to
 * go to. It brings its own theme, because the layout's is gone with it.
 */
export function AppError({ retry }: ErrorBoundaryProps) {
  return (
    <ThemeProvider>
      <ScreenError onRetry={() => void retry()} />
    </ThemeProvider>
  );
}
