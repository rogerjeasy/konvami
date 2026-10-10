import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import { Icon } from '@/components/icon';
import { AppLanguageSheet } from '@/components/language-sheet';
import { PressScale } from '@/components/motion';
import { Text } from '@/components/text';
import { LANGUAGE_NATIVE_NAMES } from '@/i18n';
import { effectiveLanguage, usePreferences } from '@/preferences';
import { useTheme } from '@/theme';

/** The "EN ⌄" pill that opens the app-language sheet. */
export function LanguagePicker() {
  const { t } = useTranslation();
  const { color } = useTheme();
  const { language: picked } = usePreferences();
  const [open, setOpen] = useState(false);
  const current = effectiveLanguage(picked);

  return (
    <>
      <PressScale
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={t('welcome.languageButton', {
          language: LANGUAGE_NATIVE_NAMES[current],
        })}
        accessibilityHint={t('welcome.languageHint')}
      >
        <View className="min-h-tap flex-row items-center gap-1.5 rounded-pill border border-border bg-bg px-3">
          <Icon name="globe" color={color.fg} size={size.icon} />
          <Text variant="labelSmall">{current.toUpperCase()}</Text>
          <Icon name="chevronDown" color={color.fg} size={size.iconSm} strokeWidth={2.2} />
        </View>
      </PressScale>

      <AppLanguageSheet visible={open} onClose={() => setOpen(false)} />
    </>
  );
}
