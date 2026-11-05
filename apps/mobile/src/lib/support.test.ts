import { supportEmailFrom, supportMailto } from './support';

describe('the support address', () => {
  it('is none when not configured or not an address', () => {
    expect(supportEmailFrom(undefined)).toBeNull();
    expect(supportEmailFrom('')).toBeNull();
    expect(supportEmailFrom('  ')).toBeNull();
    expect(supportEmailFrom('support')).toBeNull();
    expect(supportEmailFrom('two words@example.com')).toBeNull();
  });

  it('is the trimmed address when it is one', () => {
    expect(supportEmailFrom(' help@konvami.example ')).toBe('help@konvami.example');
  });

  it('opens a message with its subject encoded', () => {
    expect(supportMailto('help@konvami.example', 'Konvami: a question')).toBe(
      'mailto:help@konvami.example?subject=Konvami%3A%20a%20question',
    );
  });
});
