import { AppState, type AppStateStatus } from 'react-native';
import { getLocales, type Locale } from 'expo-localization';
import i18n from '@/i18n';
import {
  followPhoneLanguage,
  getPreferences,
  loadPreferences,
  setLanguage,
  setLiveCorrections,
  setPartnerCaptions,
} from '.';

const phone = (...tags: [string, ...string[]]) =>
  jest
    .mocked(getLocales)
    .mockReturnValue(
      tags.map((tag) => ({ languageTag: tag, languageCode: tag.split('-')[0] }) as Locale) as [
        Locale,
        ...Locale[],
      ],
    );

describe('app language', () => {
  afterEach(async () => {
    await setLanguage(null);
    phone('en-US');
  });

  it('defaults to the phone language', async () => {
    phone('de-CH');
    await loadPreferences();
    expect(getPreferences().language).toBeNull();
    expect(i18n.language).toBe('de');
  });

  it('uses the first phone language the app supports', async () => {
    phone('es-ES', 'it-CH', 'en-GB');
    await loadPreferences();
    expect(i18n.language).toBe('it');
  });

  it('falls back to English when the app supports none of the phone languages', async () => {
    phone('es-ES', 'pt-BR');
    await loadPreferences();
    expect(i18n.language).toBe('en');
  });

  it('keeps a picked language across launches, and can go back to the phone language', async () => {
    phone('de-DE');
    await setLanguage('fr');
    await loadPreferences();
    expect(i18n.language).toBe('fr');

    await setLanguage(null);
    await loadPreferences();
    expect(getPreferences().language).toBeNull();
    expect(i18n.language).toBe('de');
  });

  it('picks up a phone language change when the app returns to the foreground', async () => {
    let onChange: (state: AppStateStatus) => void = () => {};
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_, listener) => {
      onChange = listener;
      return { remove: jest.fn() };
    });
    phone('en-US');
    await loadPreferences();
    const stop = followPhoneLanguage();

    phone('fr-CH');
    onChange('active');
    expect(i18n.language).toBe('fr');
    stop();
  });
});

describe('the partner’s captions', () => {
  afterEach(async () => {
    await setPartnerCaptions(true);
  });

  it('shows them until the learner hides them, and remembers that across launches', async () => {
    await loadPreferences();
    expect(getPreferences().partnerCaptions).toBe(true);

    await setPartnerCaptions(false);
    await loadPreferences();

    expect(getPreferences().partnerCaptions).toBe(false);
  });
});

describe('live corrections', () => {
  afterEach(async () => {
    await setLiveCorrections(true);
  });

  it('show until the learner hides them, and that is remembered across launches', async () => {
    await loadPreferences();
    expect(getPreferences().liveCorrections).toBe(true);

    await setLiveCorrections(false);
    await loadPreferences();

    expect(getPreferences().liveCorrections).toBe(false);
    expect(getPreferences().partnerCaptions).toBe(true);
  });
});
