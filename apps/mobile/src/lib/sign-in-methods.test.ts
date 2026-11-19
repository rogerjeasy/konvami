import { pendingSignInShownFrom } from './sign-in-methods';

describe('sign-in ways that are not connected yet', () => {
  it('are hidden unless the build turns them on', () => {
    expect(pendingSignInShownFrom(undefined)).toBe(false);
    expect(pendingSignInShownFrom('')).toBe(false);
    expect(pendingSignInShownFrom('false')).toBe(false);
    expect(pendingSignInShownFrom('1')).toBe(false);
  });

  it('are shown when the build sets the flag to true', () => {
    expect(pendingSignInShownFrom('true')).toBe(true);
    expect(pendingSignInShownFrom(' TRUE ')).toBe(true);
  });
});
