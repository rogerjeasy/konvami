import type { ChainPlayPart, ChainStory } from '@konvami/api-client';
import { fakeChainStory } from '@/test/fake-chain';
import {
  chainShare,
  firstPart,
  nextPart,
  READ_MS_MIN,
  READ_MS_PER_WORD,
  readingTime,
  storyIsWaiting,
} from './chain';

const part = (index: number, hidden = false): ChainPlayPart => ({
  index,
  kind: 'line',
  name: 'Lena',
  ai: true,
  mine: false,
  text: hidden ? '' : 'Es war einmal.',
  position: index,
  lineId: `line-${index}`,
  hasAudio: true,
  hidden,
});

describe('the story chain rules', () => {
  it('shows a silent part as long as it takes to read, never too short', () => {
    expect(readingTime('Kurz.')).toBe(READ_MS_MIN);
    const long = Array.from({ length: 20 }, () => 'Wort').join(' ');
    expect(readingTime(long)).toBe(20 * READ_MS_PER_WORD);
  });

  it('reads a story again only while the server works on it', () => {
    const story: ChainStory = fakeChainStory('s-1');
    expect(storyIsWaiting(story)).toBe(false);
    expect(storyIsWaiting({ ...story, myTurn: false, turnSeat: 2, position: 2 })).toBe(true);
    expect(storyIsWaiting({ ...story, status: 'finishing' })).toBe(true);
    expect(storyIsWaiting({ ...story, status: 'done', playStatus: 'ready' })).toBe(false);
  });

  it('measures the chain and skips what the learner reported', () => {
    expect(chainShare(4, 8)).toBe(0.5);
    expect(chainShare(9, 8)).toBe(1);
    expect(chainShare(1, 0)).toBe(0);
    const play = [part(0, true), part(1), part(2, true), part(3)];
    expect(firstPart(play)).toBe(1);
    expect(nextPart(play, 1)).toBe(3);
    expect(nextPart(play, 3)).toBeNull();
  });
});
