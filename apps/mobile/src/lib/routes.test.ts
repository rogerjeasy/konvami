import { importCallRoute, importRoute, letterCallRoute } from './routes';

// The call's `practise` is at most 40 characters on the server.
const PRACTISE_MAX = 40;
const ID = 'ffffffff-ffff-4fff-8fff-000000000001';

describe('routes of the course companion', () => {
  it('opens one import', () => {
    expect(importRoute(ID)).toEqual({ pathname: '/import/[id]', params: { id: ID } });
  });

  it('asks for a conversation about an import by its 32 hex digits', () => {
    expect(importCallRoute('p1', ID)).toEqual({
      pathname: '/call/[personaId]',
      params: { personaId: 'p1', practise: 'import:ffffffffffff4fff8fff000000000001' },
    });
  });

  it('asks to rehearse a letter the same way', () => {
    const route = letterCallRoute('p1', ID);

    expect(route.params.practise).toBe('letter:ffffffffffff4fff8fff000000000001');
  });

  it('keeps `practise` within what the server takes', () => {
    expect(importCallRoute('p1', ID).params.practise?.length).toBeLessThanOrEqual(PRACTISE_MAX);
    expect(letterCallRoute('p1', ID).params.practise?.length).toBeLessThanOrEqual(PRACTISE_MAX);
  });
});
