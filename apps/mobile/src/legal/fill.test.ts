import { fillLegalText, missingLegalSettings } from './fill';
import type { LegalSettings } from './types';

const settings: LegalSettings = {
  controller: { name: 'Ada Example', address: 'Street 1, 8000 Zürich', email: 'ada@example.org' },
  updated: '2026-11-06',
};

describe('fillLegalText', () => {
  it('puts the controller’s details and the date into the text', () => {
    expect(
      fillLegalText(
        '{{controller.name}}, {{controller.address}}: {{controller.email}}',
        settings,
        'en',
        '–',
      ),
    ).toBe('Ada Example, Street 1, 8000 Zürich: ada@example.org');
    expect(fillLegalText('Updated {{updated}}', settings, 'de', '–')).toBe(
      'Updated 6. November 2026',
    );
  });

  it('writes the given words for a detail that is empty, never a blank', () => {
    const empty = { ...settings, controller: { name: '', address: ' ', email: 'ada@example.org' } };

    expect(
      fillLegalText('{{controller.name}} / {{controller.address}}', empty, 'en', 'not set'),
    ).toBe('not set / not set');
  });

  it('refuses a placeholder it does not know', () => {
    expect(() => fillLegalText('{{nope}}', settings, 'en', '–')).toThrow(/Unknown placeholder/);
  });
});

describe('missingLegalSettings', () => {
  it('names every empty detail', () => {
    expect(
      missingLegalSettings({ ...settings, controller: { name: '', address: 'x', email: ' ' } }),
    ).toEqual(['controller.name', 'controller.email']);
    expect(missingLegalSettings(settings)).toEqual([]);
  });
});
