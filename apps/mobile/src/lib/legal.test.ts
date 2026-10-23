import { legalUrl } from './legal';

describe('legalUrl', () => {
  it('opens the page in the app language', () => {
    expect(legalUrl('https://site.example/{lang}/privacy.html', 'de')).toBe(
      'https://site.example/de/privacy.html',
    );
  });

  it('falls back to English for a language the site does not have', () => {
    expect(legalUrl('https://site.example/{lang}/privacy.html', 'es-ES')).toBe(
      'https://site.example/en/privacy.html',
    );
  });

  it('keeps an address without a language as it is', () => {
    expect(legalUrl(' https://site.example/privacy ', 'fr')).toBe('https://site.example/privacy');
  });

  it('has no address while the page does not exist', () => {
    expect(legalUrl(undefined, 'en')).toBeUndefined();
    expect(legalUrl('  ', 'en')).toBeUndefined();
  });
});
