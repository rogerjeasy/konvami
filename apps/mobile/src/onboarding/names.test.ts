import i18n from '@/i18n';
import { FAKE_CATALOG } from '@/test/fake-api';
import { languageInText, languageName, nativeLanguageName } from './names';

describe('language names', () => {
  it('names a language in itself', () => {
    expect(nativeLanguageName(FAKE_CATALOG, 'de')).toBe('Deutsch');
    expect(nativeLanguageName(FAKE_CATALOG, 'sq')).toBe('Shqip');
    expect(nativeLanguageName(FAKE_CATALOG, 'xx')).toBe('XX');
  });

  it('names a taught language in the app language, for a label', () => {
    expect(languageName(FAKE_CATALOG, 'de', i18n.getFixedT('fr'))).toBe('Allemand');
    expect(languageName(FAKE_CATALOG, 'sq', i18n.getFixedT('fr'))).toBe('Shqip');
  });

  it.each([
    ['en', 'Why are you learning German?'],
    ['de', 'Warum lernst du Deutsch?'],
    ['fr', 'Pourquoi veux-tu parler allemand ?'],
    ['it', 'Perché vuoi parlare tedesco?'],
  ])('fits a language name into a sentence in %s', (locale, sentence) => {
    const t = i18n.getFixedT(locale);
    expect(t('onboarding.goals.title', { language: languageInText(FAKE_CATALOG, 'de', t) })).toBe(
      sentence,
    );
  });
});
