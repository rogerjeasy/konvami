import { MAX_MESSAGE_LENGTH, scrubEvent } from './scrub';

describe('a crash report', () => {
  it('drops requests, users, breadcrumbs, extras and local variables', () => {
    const event = scrubEvent({
      request: { url: 'https://api.example/v1/tutor' },
      user: { id: 'u1', email: 'amara@example.com' },
      breadcrumbs: [{ message: 'Ich habe gestern' }],
      extra: { transcript: 'Hallo' },
      server_name: 'phone',
      level: 'error',
      exception: {
        values: [{ value: 'boom', stacktrace: { frames: [{ vars: { text: 'Hallo' } }, {}] } }],
      },
    });

    expect(event).toEqual({
      level: 'error',
      exception: { values: [{ value: 'boom', stacktrace: { frames: [{}, {}] } }] },
    });
  });

  it('keeps only the start of a message and no email address', () => {
    const event = scrubEvent({
      message: 'amara@example.com wrote',
      exception: { values: [{ value: `amara@example.com ${'x'.repeat(500)}` }] },
    });

    expect(event.message).toBe('[email] wrote');
    const text = event.exception?.values?.[0]?.value ?? '';
    expect(text).not.toContain('amara@example.com');
    expect(text.length).toBeLessThanOrEqual(MAX_MESSAGE_LENGTH);
  });
});
