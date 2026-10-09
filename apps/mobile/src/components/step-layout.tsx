import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { space } from '@konvami/design-tokens';
import { useScreenLayout } from '@/hooks/use-screen-layout';

/**
 * The layout of every form step (2.1–2.5): a header row, content that scrolls, and the actions
 * pinned at the bottom so the main button stays reachable, also above the keyboard.
 *
 * On wide windows everything stays in one readable column, centered. Screens supply content only;
 * spacing, safe areas and keyboard handling live here.
 */
export function StepLayout({
  header,
  children,
  footer,
  actions,
}: {
  /** The top row: a `StepHeader`, or a lone back button. */
  header: ReactNode;
  children: ReactNode;
  /** Quiet content at the end of the scrolling area (legal text), pushed to its bottom. */
  footer?: ReactNode;
  /** Buttons, stacked full width, pinned to the bottom. */
  actions?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { gutter } = useScreenLayout();
  const bottomInset = Math.max(insets.bottom, space.lg) + space.lg;
  return (
    <KeyboardAvoidingView
      className="flex-1 bg-bg"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View
        className="w-full max-w-content self-center"
        // The header sits a little closer to the edge than the content, as on the design.
        style={{ paddingTop: insets.top + space.sm, paddingHorizontal: gutter - space.sm }}
      >
        {header}
      </View>
      <ScrollView
        className="flex-1"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: gutter,
          paddingTop: space['3xl'],
          paddingBottom: actions ? space['2xl'] : bottomInset,
        }}
      >
        <View className="w-full max-w-content flex-1 gap-6 self-center">
          {children}
          {footer ? <View className="flex-1 justify-end pt-2">{footer}</View> : null}
        </View>
      </ScrollView>
      {actions ? (
        <View
          className="items-center"
          style={{ paddingHorizontal: gutter, paddingTop: space.sm, paddingBottom: bottomInset }}
        >
          <View className="w-full max-w-content gap-1.5">{actions}</View>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}
