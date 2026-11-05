import { ApiError } from '@konvami/api-client';
import { apiErrorCode, apiErrorKey, failureOf, problemTone } from './messages';

describe('apiErrorKey', () => {
  it.each([
    'text_instructions',
    'text_link',
    'text_contact',
    'text_unsafe',
    'moderation_unavailable',
    'moderation_limit',
  ])('gives words that were turned down (%s) a sentence of their own', (code) => {
    expect(apiErrorKey(code)).toBe(`errors.moderation.${code}`);
  });

  it('keeps the general sentences for everything else', () => {
    expect(apiErrorKey('network')).toBe('errors.network');
    expect(apiErrorKey('writer_unavailable')).toBe('errors.unknown');
  });
});

describe('problemTone', () => {
  it('shows a refusal of words as a calm note and any other failure as an alarm', () => {
    expect(problemTone('text_link')).toBe('surface');
    expect(problemTone('moderation_unavailable')).toBe('surface');
    expect(problemTone('network')).toBe('danger');
    expect(failureOf('Sorry', 'text_unsafe')).toEqual({ message: 'Sorry', tone: 'surface' });
  });
});

describe('apiErrorCode', () => {
  it('reads the code of an API error', () => {
    expect(apiErrorCode(new ApiError('text_link', 422))).toBe('text_link');
    expect(apiErrorCode(new Error('x'))).toBe('unknown');
  });
});
