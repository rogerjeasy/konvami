import type { ReactNode } from 'react';
import { useColorScheme, View } from 'react-native';
import { vars } from 'nativewind';
import { cssVariables, palette, type ColorScheme, type Palette } from '@konvami/design-tokens';

export * from '@konvami/design-tokens';

// Built once: the CSS variables for each theme (NativeWind reads them for every `bg-*`/`text-*`).
const THEME_VARS: Record<ColorScheme, ReturnType<typeof vars>> = {
  light: vars(cssVariables('light')),
  dark: vars(cssVariables('dark')),
};

/** The active color scheme and its resolved palette, for the few places that need raw colors (SVG). */
export function useTheme(): { scheme: ColorScheme; color: Palette } {
  const scheme: ColorScheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  return { scheme, color: palette(scheme) };
}

/**
 * Sets the theme's color variables for everything below it. Mounted at the root, and again inside
 * anything rendered outside the root tree (a Modal is a separate DOM root on web).
 */
export function ThemeScope({ children, className }: { children: ReactNode; className?: string }) {
  const { scheme } = useTheme();
  return (
    <View style={THEME_VARS[scheme]} className={className ?? 'flex-1'}>
      {children}
    </View>
  );
}

/** The app's root theme: color variables plus the screen background. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return <ThemeScope className="flex-1 bg-bg">{children}</ThemeScope>;
}
