import { createPostHog, DEFAULT_ANALYTICS_HOST, readAnalyticsConfig } from './posthog';

describe('analytics settings', () => {
  it('are off without a key', () => {
    expect(readAnalyticsConfig({})).toBeNull();
    expect(readAnalyticsConfig({ key: '  ', host: 'https://eu.i.posthog.com' })).toBeNull();
  });

  it('use the EU cloud unless another host is given, and never a host without https', () => {
    expect(readAnalyticsConfig({ key: 'phc_1' })).toEqual({
      key: 'phc_1',
      host: DEFAULT_ANALYTICS_HOST,
    });
    expect(readAnalyticsConfig({ key: 'phc_1', host: 'https://ph.example.test/' })).toEqual({
      key: 'phc_1',
      host: 'https://ph.example.test',
    });
    expect(readAnalyticsConfig({ key: 'phc_1', host: 'http://ph.example.test' })).toBeNull();
  });
});

describe('sending an event', () => {
  const config = { key: 'phc_1', host: 'https://eu.i.posthog.com' };
  const context = { appVersion: '0.1.0', platform: 'ios' };

  it('posts the name, the install id, the version and the platform, and no person', async () => {
    const send = jest.fn(async () => new Response('{}'));
    const analytics = createPostHog(config, async () => 'install-1', context, send);

    analytics.capture('conversation_started', { purpose: 'practice' });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(send).toHaveBeenCalledTimes(1);
    const [url, init] = send.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://eu.i.posthog.com/capture/');
    expect(JSON.parse(init.body as string)).toEqual({
      api_key: 'phc_1',
      event: 'conversation_started',
      distinct_id: 'install-1',
      properties: {
        purpose: 'practice',
        app_version: '0.1.0',
        platform: 'ios',
        $process_person_profile: false,
        $lib: 'konvami',
      },
    });
  });

  it('never throws when the network fails', async () => {
    const send = jest.fn(async () => {
      throw new Error('offline');
    });
    const analytics = createPostHog(config, async () => 'install-1', context, send);

    expect(() => analytics.capture('app_opened')).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(send).toHaveBeenCalled();
  });
});
