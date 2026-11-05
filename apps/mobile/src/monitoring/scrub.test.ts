import { REDACTED, scrubEvent } from './scrub';

describe('a crash report', () => {
  it('drops requests, users, breadcrumbs, extras, tags and local variables', () => {
    const event = scrubEvent({
      request: { url: 'https://api.example/v1/tutor' },
      user: { id: 'u1', email: 'amara@example.com' },
      breadcrumbs: [{ message: 'Ich habe gestern' }],
      extra: { transcript: 'Hallo' },
      tags: { screen: 'Wie geht es dir, Amara?' },
      logentry: { message: 'Ich habe gestern Brot gekauft' },
      server_name: 'phone',
      level: 'error',
      exception: {
        values: [
          {
            value: 'boom',
            mechanism: { data: { text: 'Hallo' } },
            stacktrace: { frames: [{ vars: { text: 'Hallo' } }, {}] },
          },
        ],
      },
    });

    expect(event).toEqual({
      level: 'error',
      exception: { values: [{ value: REDACTED, mechanism: {}, stacktrace: { frames: [{}, {}] } }] },
    });
  });

  it('replaces a message that holds a sentence and a name, in an exception or on its own', () => {
    const sentence = 'Ich heisse Amara und ich wohne seit zwei Jahren in Zürich';
    const event = scrubEvent({
      message: sentence,
      exception: { values: [{ value: `ValidationError: ${sentence}` }] },
    });

    expect(event.message).toBe(REDACTED);
    expect(event.exception?.values?.[0]?.value).toBe(REDACTED);
    expect(JSON.stringify(event)).not.toContain('Amara');
  });

  it('replaces a single lowercase word, which may be something the learner said', () => {
    const event = scrubEvent({ message: 'hallo', exception: { values: [{ value: 'amara' }] } });

    expect(event.message).toBe(REDACTED);
    expect(event.exception?.values?.[0]?.value).toBe(REDACTED);
  });

  it('keeps the type and the stack, and a plain error code', () => {
    const event = scrubEvent({
      message: 'not_found',
      exception: {
        values: [{ value: 'network', stacktrace: { frames: [{ function: 'load' }] } }],
      },
    } as Parameters<typeof scrubEvent>[0]);

    expect(event.message).toBe('not_found');
    expect(event.exception?.values?.[0]?.value).toBe('network');
    expect(event.exception?.values?.[0]?.stacktrace?.frames).toEqual([{ function: 'load' }]);
  });

  it('keeps only the contexts that describe the phone and the app', () => {
    const event = scrubEvent({
      contexts: {
        device: { model: 'iPhone 16' },
        os: { name: 'iOS' },
        app: { app_version: '0.1.0' },
        state: { value: { screen: 'Ich habe gestern' } },
        react_native_context: { js_engine: 'hermes', component_stack: 'Wie geht es dir' },
      },
    });

    expect(Object.keys(event.contexts ?? {}).sort()).toEqual(['app', 'device', 'os']);
  });
});
