import { readAuthConfig } from './config';

describe('readAuthConfig', () => {
  it('reads the region and client id, ignoring surrounding spaces', () => {
    expect(readAuthConfig({ region: ' eu-central-1 ', clientId: 'abc123\n' })).toEqual({
      region: 'eu-central-1',
      clientId: 'abc123',
    });
  });

  it.each([
    [{ clientId: 'abc123' }],
    [{ region: 'eu-central-1' }],
    [{ region: ' ', clientId: 'abc123' }],
    [{}],
  ])('is null when a required value is missing: %p', (env) => {
    expect(readAuthConfig(env)).toBeNull();
  });
});
