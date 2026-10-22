import { nextRecorded } from './playlist';

const AUDIO = { url: 'https://files.test/a.wav', milliseconds: 1200 };
const TURNS = [{ audio: AUDIO }, { audio: null }, { audio: AUDIO }, { audio: AUDIO }];

describe('nextRecorded', () => {
  it('finds the next turn that has a recording', () => {
    expect(nextRecorded(TURNS, 0)).toBe(2);
    expect(nextRecorded(TURNS, 2)).toBe(3);
  });

  it('says when there is none after a turn', () => {
    expect(nextRecorded(TURNS, 3)).toBeNull();
    expect(nextRecorded([{ audio: null }], 0)).toBeNull();
  });

  it('can start before the first turn', () => {
    expect(nextRecorded(TURNS.slice(1), -1)).toBe(1);
  });
});
