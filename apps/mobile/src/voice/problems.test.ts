import { withLine } from './problems';

describe('a call problem with its second line', () => {
  it('adds the line after the problem', () => {
    expect(withLine('Minutes used up.', 'They come back on Monday.')).toBe(
      'Minutes used up. They come back on Monday.',
    );
  });

  it('is the problem alone without one', () => {
    expect(withLine('Minutes used up.', null)).toBe('Minutes used up.');
  });
});
