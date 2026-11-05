import i18n from '@/i18n';
import { FAKE_CATALOG } from '@/test/fake-api';
import { describeSetting, settingName } from './changes';

const context = (locale = 'en') => ({
  t: i18n.getFixedT(locale),
  locale,
  catalog: FAKE_CATALOG,
  language: 'de',
});

describe('settings changed by voice, in words', () => {
  it('names a setting', () => {
    expect(settingName('explanation_language', i18n.getFixedT('en'))).toBe('Explanation language');
    expect(settingName('weekly_habit', i18n.getFixedT('de'))).toBe('Wochenziel');
  });

  it('shows a setting this version does not know by its own name', () => {
    expect(settingName('hands_free', i18n.getFixedT('en'))).toBe('hands_free');
  });

  it.each([
    ['explanation_language', 'fr', 'Français'],
    ['explanation_usage', 'freely', 'Whenever it helps'],
    ['exam', null, 'None'],
    ['course', { name: 'Menschen A2', chapter: '7' }, 'Menschen A2 · Chapter 7'],
    ['course', { name: 'Menschen A2', chapter: null }, 'Menschen A2'],
    ['level_goal', { level: 'B2', by: '2027-01-31' }, 'B2 by January 31, 2027'],
    ['level_goal', { level: 'B2', by: null }, 'B2'],
    ['weekly_habit', { days: 3, minutes: 60 }, '3 days, 60 min a week'],
  ])('says %s as it reads', (field, value, words) => {
    expect(describeSetting(field, value, context())).toBe(words);
  });

  it('says an exam with its name, level and day', () => {
    const exam = { type: 'goethe', target_level: 'B1', date: '2026-12-01' };

    expect(describeSetting('exam', exam, context())).toBe(
      'Goethe-Zertifikat · B1 · December 1, 2026',
    );
  });

  it('says it in the language of the app', () => {
    expect(describeSetting('weekly_habit', { days: 3, minutes: 60 }, context('de'))).toContain(
      '60',
    );
    expect(describeSetting('exam', null, context('fr'))).toBe('Aucun');
  });
});
