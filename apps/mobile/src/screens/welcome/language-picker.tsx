import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import { Icon } from '@/components/icon';
import { PressScale } from '@/components/motion';
import { ChoiceRow, Sheet } from '@/components/sheet';
import { Text } from '@/components/text';
import { deviceLanguage, LANGUAGE_NATIVE_NAMES, SUPPORTED_LANGUAGES, type Language } from '@/i18n';
import { stepFeedback } from '@/lib/haptics';
import { effectiveLanguage, setLanguage, usePreferences } from '@/preferences';
import { useTheme } from '@/theme';

/**
 * The "EN ⌄" pill that opens the app-language sheet. By default the app follows the phone's
 * language; picking one here overrides it on this device, and "Phone language" goes back.
 */
export function LanguagePicker() {
  const { t } = useTranslation();
  const { color } = useTheme();
  const { language: picked } = usePreferences();
  const [open, setOpen] = useState(false);
  const current = effectiveLanguage(picked);

  const choose = (language: Language | null) => {
    stepFeedback();
    setOpen(false);
    void setLanguage(language);
  };

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

      <Sheet visible={open} title={t('welcome.languageSheetTitle')} onClose={() => setOpen(false)}>
        <View accessibilityRole="radiogroup" className="gap-1">
          <ChoiceRow
            label={t('welcome.phoneLanguage', {
              language: LANGUAGE_NATIVE_NAMES[deviceLanguage()],
            })}
            selected={picked === null}
            onPress={() => choose(null)}
          />
          {SUPPORTED_LANGUAGES.map((language) => (
            <ChoiceRow
              key={language}
              label={LANGUAGE_NATIVE_NAMES[language]}
              selected={language === picked}
              onPress={() => choose(language)}
            />
          ))}
        </View>
      </Sheet>
    </>
  );
}
