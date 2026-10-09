import { useState, type ReactNode } from 'react';
import { Pressable, TextInput, View, type TextInputProps } from 'react-native';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import { FocusRing } from '@/components/focus-ring';
import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import { useTheme } from '@/theme';

type FieldProps = Omit<TextInputProps, 'style' | 'accessibilityLabel'> & {
  label: string;
  /** Shown under the field in the error color and announced to screen readers. */
  error?: string;
  /** Something at the start of the field: an icon saying what it holds. */
  leading?: ReactNode;
  /** Something at the end of the field: a check mark, the show/hide button. */
  trailing?: ReactNode;
};

/**
 * A labelled text field (52 pt, design token `size.fieldHeight`). The field grows with the OS text
 * size instead of clipping. The visible label is also the field's accessible name.
 */
export function TextField({
  label,
  error,
  leading,
  trailing,
  onFocus,
  onBlur,
  ...input
}: FieldProps) {
  const { color } = useTheme();
  const [focused, setFocused] = useState(false);
  const look = error
    ? 'border-danger-border bg-bg'
    : focused
      ? 'border-primary bg-bg'
      : 'border-field-border bg-field';
  return (
    <View className="gap-1.5">
      {/* The input carries the label for screen readers, so the visible copy is not read twice. */}
      <Text variant="fieldLabel" aria-hidden>
        {label}
      </Text>
      <FocusRing active={focused && !error}>
        <View
          className={`min-h-field flex-row items-center gap-2.5 rounded-field border pl-4 ${trailing ? 'pr-1' : 'pr-4'} ${look}`}
        >
          {leading}
          <TextInput
            {...input}
            accessibilityLabel={label}
            aria-invalid={Boolean(error)}
            onFocus={(e) => {
              setFocused(true);
              onFocus?.(e);
            }}
            onBlur={(e) => {
              setFocused(false);
              onBlur?.(e);
            }}
            selectionColor={color.primary}
            cursorColor={color.primary}
            placeholderTextColor={color.fgSubtle}
            className="min-w-0 flex-1 py-3 font-body text-body text-fg outline-none"
          />
          {trailing}
        </View>
      </FocusRing>
      {error ? (
        <Text variant="small" tone="danger" role="alert" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

/** A password field with a show/hide button. Hidden by default. */
export function PasswordField(props: Omit<FieldProps, 'trailing' | 'secureTextEntry'>) {
  const { t } = useTranslation();
  const { color } = useTheme();
  const [visible, setVisible] = useState(false);
  return (
    <TextField
      autoCapitalize="none"
      autoCorrect={false}
      {...props}
      secureTextEntry={!visible}
      trailing={
        <Pressable
          onPress={() => setVisible((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={t(visible ? 'common.hidePassword' : 'common.showPassword')}
          className="min-h-tap min-w-tap items-center justify-center active:opacity-pressed"
        >
          <Icon name={visible ? 'eyeOff' : 'eye'} color={color.fgSubtle} size={size.iconMd} />
        </Pressable>
      }
    />
  );
}
