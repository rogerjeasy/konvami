import { deviceTimeZone } from './time-zone';

describe('deviceTimeZone', () => {
  const original = Intl.DateTimeFormat;
  afterEach(() => {
    Intl.DateTimeFormat = original;
  });

  function withZone(timeZone: unknown) {
    // A plain function, so that it can be called with `new` like the real one.
    Intl.DateTimeFormat = function () {
      return { resolvedOptions: () => ({ timeZone }) };
    } as unknown as typeof Intl.DateTimeFormat;
  }

  it('names the zone the device is set to', () => {
    withZone('Europe/Zurich');

    expect(deviceTimeZone()).toBe('Europe/Zurich');
  });

  it.each([[undefined], [''], [42]])('is undefined when the device gives %p', (given) => {
    withZone(given);

    expect(deviceTimeZone()).toBeUndefined();
  });

  it('is undefined when the device cannot say', () => {
    Intl.DateTimeFormat = function () {
      throw new RangeError('no time zone support');
    } as unknown as typeof Intl.DateTimeFormat;

    expect(deviceTimeZone()).toBeUndefined();
  });
});
