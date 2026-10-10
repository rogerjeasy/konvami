import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ChoiceRow, Sheet } from '@/components/sheet';
import { deviceLanguage, LANGUAGE_NATIVE_NAMES, SUPPORTED_LANGUAGES, type Language } from '@/i18n';
import { stepFeedback } from '@/lib/haptics';
import { effectiveLanguage, setLanguage, usePreferences } from '@/preferences';

/**
 * The sheet that picks the app language. By default the app follows the phone's language;
 * picking one here overrides it on this device, and "Phone language" goes back.
 */
export function AppLanguageSheet({
  visible,
  onClose,
  onChosen,
}: {
  visible: boolean;
  onClose: () => void;
  /** Called with the language the app now shows, after the choice was applied. */
  onChosen?: (language: Language) => void;
}) {
  const { t } = useTranslation();
  const { language: picked } = usePreferences();

  const choose = (language: Language | null) => {
    stepFeedback();
    onClose();
    void setLanguage(language);
    onChosen?.(effectiveLanguage(language));
  };

  return (
    <Sheet visible={visible} title={t('welcome.languageSheetTitle')} onClose={onClose}>
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
  );
}
