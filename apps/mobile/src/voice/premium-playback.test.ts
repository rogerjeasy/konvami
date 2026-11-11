import { premiumPlayback } from './premium-playback';

const note = (url = 'https://private.test/audio') => ({
  type: 'conversation.item.done',
  item: {
    role: 'system',
    content: [
      {
        type: 'input_text',
        text:
          'premium_audio: ' +
          JSON.stringify({
            id: 'reply1',
            text: 'Bonjour!',
            url,
            milliseconds: 1400,
          }),
      },
    ],
  },
});

it('plays a receipt once, with captions, and interrupts it when the learner speaks', () => {
  const clips = { play: jest.fn(), stop: jest.fn() };
  const emit = jest.fn();
  const playback = premiumPlayback(clips, emit);
  playback.handle(note());
  playback.handle(note());
  expect(clips.play).toHaveBeenCalledTimes(1);
  expect(emit).toHaveBeenCalledWith({
    type: 'response.output_audio_transcript.done',
    item_id: 'reply1',
    transcript: 'Bonjour!',
  });
  const done = clips.play.mock.calls[0]?.[1] as () => void;
  playback.handle({ type: 'input_audio_buffer.speech_started' });
  emit.mockClear();
  done();
  expect(emit).not.toHaveBeenCalled();
});

it('ignores malformed or local URLs', () => {
  const clips = { play: jest.fn(), stop: jest.fn() };
  const playback = premiumPlayback(clips, jest.fn());
  playback.handle(note('file:///private/data'));
  playback.handle(null);
  expect(clips.play).not.toHaveBeenCalled();
});
