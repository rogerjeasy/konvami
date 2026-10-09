import { useMemo, type ReactNode } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { motion, size, space } from '@konvami/design-tokens';
import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import { Animate } from '@/components/motion';
import { slideUpKeyframes } from '@/lib/motion';
import { ThemeScope, useTheme } from '@/theme';

/**
 * A bottom sheet for short choices. The scrim fades in while the sheet slides up from the bottom
 * edge. Closes on the scrim, the close button, or the system back gesture. On wide screens it
 * stays a readable width, centered.
 */
export function Sheet({
  visible,
  title,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const { color } = useTheme();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const slideUp = useMemo(() => slideUpKeyframes(reduced), [reduced]);
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <ThemeScope>
        <View className="flex-1 justify-end bg-scrim">
          <Pressable
            className="flex-1"
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
          />
          <Animate
            keyframes={slideUp}
            duration={motion.slow}
            play={visible}
            style={{ width: '100%', maxWidth: size.contentMaxWidth, alignSelf: 'center' }}
          >
            <View
              accessibilityViewIsModal
              className="w-full rounded-t-panel bg-bg px-5 pt-3"
              style={{ paddingBottom: Math.max(insets.bottom, space.lg) + space.sm }}
            >
              <View className="flex-row items-center justify-between gap-3 pb-2">
                <Text variant="heading" accessibilityRole="header" className="shrink">
                  {title}
                </Text>
                <Pressable
                  onPress={onClose}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.close')}
                  className="min-h-tap min-w-tap items-center justify-center active:opacity-pressed"
                >
                  <Icon name="close" color={color.fgMuted} size={space.xl} />
                </Pressable>
              </View>
              {children}
            </View>
          </Animate>
        </View>
      </ThemeScope>
    </Modal>
  );
}

/** One option in a single-choice list (role "radio"). */
export function ChoiceRow({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { color } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      className={`min-h-field flex-row items-center justify-between gap-3 rounded-field px-4 py-3 active:opacity-pressed ${
        selected ? 'bg-primary-soft' : ''
      }`}
    >
      <Text variant="label" tone={selected ? 'primary' : 'fg'} className="shrink">
        {label}
      </Text>
      {selected ? (
        <Icon name="check" color={color.primaryText} size={space.xl} strokeWidth={2.4} />
      ) : null}
    </Pressable>
  );
}
