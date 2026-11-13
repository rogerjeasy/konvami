import { transportEvent } from './transport-event';
import { conversationReducer, INITIAL_CONVERSATION, LIVE_CORRECTION_NOTE } from './conversation';

it('keeps repeated provider item ids as separate captions across transports', () => {
  const event = {
    type: 'response.output_audio_transcript.done',
    item_id: 'item_1',
    transcript: 'First',
  };
  const first = conversationReducer(INITIAL_CONVERSATION, transportEvent(event, 0));
  const second = conversationReducer(first, transportEvent({ ...event, transcript: 'Second' }, 1));
  expect(second.captions.map(({ text }) => text)).toEqual(['First', 'Second']);
  expect(event.item_id).toBe('item_1');
});

it('keeps corrections and premium receipts in the same transport namespace', () => {
  const note = {
    type: 'conversation.item.done',
    item: {
      role: 'system',
      type: 'message',
      content: [
        {
          type: 'input_text',
          text: LIVE_CORRECTION_NOTE + JSON.stringify({ turn: 'item_1', corrections: [] }),
        },
        {
          type: 'input_text',
          text:
            'premium_audio: ' + JSON.stringify({ id: 'item_2', url: 'https://audio.example/clip' }),
        },
      ],
    },
  };
  const mapped = transportEvent(note, 2) as typeof note;
  expect(mapped.item.content[0]!.text).toContain('transport_2_item_1');
  expect(mapped.item.content[1]!.text).toContain('transport_2_item_2');
  expect(note.item.content[0]!.text).not.toContain('transport_2_');
});

it('namespaces tool ids consistently and leaves malformed notes alone', () => {
  const early = transportEvent({ call_id: 'tool_1' }, 1) as { call_id: string };
  const late = transportEvent(
    { item: { call_id: 'tool_1', content: [{ text: 'premium_audio: {' }] } },
    1,
  ) as { item: { call_id: string; content: { text: string }[] } };
  expect(early.call_id).toBe(late.item.call_id);
  expect(late.item.content[0]!.text).toBe('premium_audio: {');
  expect(transportEvent(null, 1)).toBeNull();
});
