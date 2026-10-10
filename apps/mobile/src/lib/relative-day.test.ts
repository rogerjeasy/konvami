import i18n from '@/i18n';
import { relativeDayLabel, relativeDayPhrase } from './relative-day';

const now = new Date(2026, 9, 9, 8, 0);
const at = (day: number, hour = 12, month = 9) => new Date(2026, month, day, hour).toISOString();
const t = i18n.getFixedT('en');

describe('relativeDayPhrase: a past day as it reads inside a sentence', () => {
  it.each([
    [at(9, 7), 'today'],
    [at(8, 23), 'yesterday'],
    [at(7), '2 days ago'],
    [at(3), '6 days ago'],
    // Beyond a week of days, the date says more than a count.
    [at(2), 'on Oct 2'],
    [at(30, 12, 8), 'on Sep 30'],
  ])('%s is "%s"', (iso, phrase) => {
    expect(relativeDayPhrase(t, 'en', iso, now)).toBe(phrase);
  });

  it('follows the language', () => {
    const german = i18n.getFixedT('de');

    expect(relativeDayPhrase(german, 'de', at(8), now)).toBe('gestern');
    expect(relativeDayPhrase(german, 'de', at(8, 12, 9), now)).toBe('gestern');
    expect(relativeDayPhrase(german, 'de', at(6), now)).toBe('vor 3 Tagen');
    expect(relativeDayPhrase(german, 'de', at(2), now)).toBe('am 2. Okt.');
    expect(relativeDayPhrase(i18n.getFixedT('fr'), 'fr', at(8), now)).toBe('hier');
  });
});

describe('relativeDayLabel: a past day standing on its own', () => {
  it.each([
    [at(9, 7), 'Today'],
    [at(8, 23), 'Yesterday'],
    [at(7), '2 days ago'],
    // No "on": a label is not a sentence.
    [at(2), 'Oct 2'],
  ])('%s is "%s"', (iso, label) => {
    expect(relativeDayLabel(t, 'en', iso, now)).toBe(label);
  });

  it('starts with a capital in every language', () => {
    expect(relativeDayLabel(i18n.getFixedT('fr'), 'fr', at(9, 7), now)).toBe('Aujourd’hui');
    expect(relativeDayLabel(i18n.getFixedT('it'), 'it', at(7), now)).toBe('2 giorni fa');
    expect(relativeDayLabel(i18n.getFixedT('de'), 'de', at(6), now)).toBe('Vor 3 Tagen');
  });
});
