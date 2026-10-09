import { AI_CONSENT_VERSION, decodeAiConsent, encodeAiConsent, encodeTipsOptIn } from './consent';

const at = new Date('2026-10-09T12:30:00.000Z');

describe('AI consent record', () => {
  it('stores the text version, the moment and each provider choice', () => {
    expect(encodeAiConsent({ elevenlabs: true, bedrock: false }, at)).toBe(
      `${AI_CONSENT_VERSION}|2026-10-09T12:30:00.000Z|openai=1,elevenlabs=1,bedrock=0`,
    );
  });

  it('reads back what it stored', () => {
    const stored = encodeAiConsent({ elevenlabs: false, bedrock: true }, at);
    expect(decodeAiConsent(stored)).toEqual({
      version: AI_CONSENT_VERSION,
      at: '2026-10-09T12:30:00.000Z',
      providers: { openai: true, elevenlabs: false, bedrock: true },
    });
  });

  it.each([undefined, '', 'yes', 'v1|not-a-date|openai=1', 'v1|2026-10-09T12:30:00.000Z|'])(
    'treats %p as no consent',
    (stored) => {
      expect(decodeAiConsent(stored)).toBeNull();
    },
  );

  it('treats a record without the required provider as no consent', () => {
    expect(
      decodeAiConsent('v1|2026-10-09T12:30:00.000Z|openai=0,elevenlabs=1,bedrock=1'),
    ).toBeNull();
  });
});

describe('email tips record', () => {
  it('stores the choice with the day it was made', () => {
    expect(encodeTipsOptIn(true, at)).toBe('1|2026-10-09');
    expect(encodeTipsOptIn(false, at)).toBe('0|2026-10-09');
  });
});
