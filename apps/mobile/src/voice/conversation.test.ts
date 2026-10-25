import { conversationReducer, INITIAL_CONVERSATION, type ConversationState } from './conversation';

/**
 * Events as the voice provider really sends them over the call's data channel (captured from a
 * live call on 2026-10-09; ids shortened, fields kept).
 */
const SESSION_CREATED = {
  type: 'session.created',
  event_id: 'event_1',
  session: {
    type: 'realtime',
    object: 'realtime.session',
    id: 'sess_1',
    model: 'gpt-realtime-2.1',
  },
};
const RESPONSE_CREATED = {
  type: 'response.created',
  event_id: 'event_2',
  response: { object: 'realtime.response', id: 'resp_1', status: 'in_progress', output: [] },
};
const AUDIO_STARTED = {
  type: 'output_audio_buffer.started',
  event_id: 'event_3',
  response_id: 'resp_1',
};
const AUDIO_STOPPED = {
  type: 'output_audio_buffer.stopped',
  event_id: 'event_4',
  response_id: 'resp_1',
};
const personaDelta = (delta: string, item = 'item_a') => ({
  type: 'response.output_audio_transcript.delta',
  event_id: 'event_5',
  response_id: 'resp_1',
  item_id: item,
  output_index: 0,
  content_index: 0,
  delta,
  obfuscation: '3aEAr82qt6WLfJ',
});
const personaDone = (transcript: string, item = 'item_a') => ({
  type: 'response.output_audio_transcript.done',
  event_id: 'event_6',
  response_id: 'resp_1',
  item_id: item,
  output_index: 0,
  content_index: 0,
  transcript,
});
const learnerDelta = (delta: string, item = 'item_u') => ({
  type: 'conversation.item.input_audio_transcription.delta',
  event_id: 'event_7',
  item_id: item,
  content_index: 0,
  delta,
});
const learnerDone = (transcript: string, item = 'item_u') => ({
  type: 'conversation.item.input_audio_transcription.completed',
  event_id: 'event_8',
  item_id: item,
  content_index: 0,
  transcript,
});
const toolResult = (output: unknown) => ({
  type: 'conversation.item.done',
  event_id: 'event_9',
  previous_item_id: 'item_call',
  item: {
    id: 'item_out',
    type: 'function_call_output',
    call_id: 'call_sR7FXgF1JlqwaiUU',
    output: JSON.stringify(output),
  },
});

const after = (...events: unknown[]): ConversationState =>
  events.reduce<ConversationState>(conversationReducer, INITIAL_CONVERSATION);

describe('the phase of the conversation', () => {
  it('is connecting until the call exists', () => {
    expect(INITIAL_CONVERSATION.phase).toBe('connecting');
    expect(after(SESSION_CREATED).phase).toBe('thinking');
  });

  it('follows the persona from thinking to speaking to listening', () => {
    expect(after(SESSION_CREATED, RESPONSE_CREATED).phase).toBe('thinking');
    expect(after(SESSION_CREATED, RESPONSE_CREATED, AUDIO_STARTED).phase).toBe('speaking');
    expect(after(SESSION_CREATED, RESPONSE_CREATED, AUDIO_STARTED, AUDIO_STOPPED).phase).toBe(
      'listening',
    );
  });

  it('shows that the learner is being heard, then that a reply is coming', () => {
    const heard = after(SESSION_CREATED, {
      type: 'input_audio_buffer.speech_started',
      item_id: 'item_u',
    });
    expect(heard.phase).toBe('hearing');
    expect(
      conversationReducer(heard, { type: 'input_audio_buffer.speech_stopped', item_id: 'item_u' })
        .phase,
    ).toBe('thinking');
  });

  it('keeps showing speech while a further reply is prepared behind it', () => {
    expect(after(SESSION_CREATED, AUDIO_STARTED, RESPONSE_CREATED).phase).toBe('speaking');
  });

  it('goes back to listening when the learner cuts the persona off', () => {
    const cleared = {
      type: 'output_audio_buffer.cleared',
      event_id: 'event_x',
      response_id: 'resp_1',
    };
    expect(after(SESSION_CREATED, AUDIO_STARTED, cleared).phase).toBe('listening');
  });
});

describe('captions', () => {
  it('grow word by word while the persona speaks, then settle on the final text', () => {
    const speaking = after(personaDelta('Hi'), personaDelta(' Amara'));
    expect(speaking.captions).toEqual([
      { id: 'item_a', speaker: 'persona', text: 'Hi Amara', final: false },
    ]);

    const done = conversationReducer(speaking, personaDone('Hi Amara! Is English okay?'));
    expect(done.captions).toEqual([
      { id: 'item_a', speaker: 'persona', text: 'Hi Amara! Is English okay?', final: true },
    ]);
  });

  it('show what the learner said, in order with the persona’s lines', () => {
    const state = after(
      personaDone('Is English okay?'),
      learnerDelta('Yes,'),
      learnerDone('Yes, English is fine.'),
      personaDelta('Great', 'item_b'),
    );

    expect(state.captions.map((caption) => [caption.speaker, caption.text])).toEqual([
      ['persona', 'Is English okay?'],
      ['learner', 'Yes, English is fine.'],
      ['persona', 'Great'],
    ]);
  });

  it('skip a line that turned out to be empty', () => {
    expect(after(learnerDelta(''), learnerDone('  ')).captions).toEqual([]);
  });

  it('keep only the most recent lines', () => {
    const many = Array.from({ length: 12 }, (_, i) => personaDone(`Line ${i}`, `item_${i}`));

    const { captions } = after(...many);

    expect(captions).toHaveLength(8);
    expect(captions.at(-1)?.text).toBe('Line 11');
  });
});

describe('what the learner said', () => {
  it('is kept in full, final lines only, though captions keep only the latest', () => {
    const lines = Array.from({ length: 10 }, (_, i) => learnerDone(`Satz ${i}`, `item_${i}`));

    const state = after(learnerDelta('Halb'), ...lines, {
      type: 'learner.typed',
      id: 'typed_1',
      text: 'Ich weiß nicht.',
    });

    expect(state.learnerLines).toEqual([
      ...Array.from({ length: 10 }, (_, i) => `Satz ${i}`),
      'Ich weiß nicht.',
    ]);
  });
});

describe('progress', () => {
  it('is unknown until the server has saved something', () => {
    expect(after(SESSION_CREATED).stillOpen).toBeNull();
  });

  it('follows what the server reports as still open after each saved answer', () => {
    const state = after(
      toolResult({ saved: true, still_open: ['explanations', 'goals', 'exam', 'level', 'course'] }),
      toolResult({ saved: true, still_open: ['goals', 'exam', 'level', 'course'] }),
    );

    expect(state.stillOpen).toEqual(['goals', 'exam', 'level', 'course']);
    expect(state.finished).toBe(false);
  });

  it('does not move when an answer could not be saved', () => {
    const state = after(
      toolResult({ saved: true, still_open: ['goals'] }),
      toolResult({ saved: false, reason: 'invalid_value' }),
    );

    expect(state.stillOpen).toEqual(['goals']);
  });

  it('is finished when the server says so, and over once the goodbye has been heard', () => {
    const finished = after(toolResult({ done: true }));
    expect(finished).toMatchObject({ finished: true, over: false, stillOpen: [] });

    expect(after(toolResult({ done: true }), AUDIO_STARTED, AUDIO_STOPPED).over).toBe(true);
  });

  it('is not over when audio stops before the setup is finished', () => {
    expect(after(AUDIO_STARTED, AUDIO_STOPPED).over).toBe(false);
  });

  it('ignores a tool result it cannot read', () => {
    const broken = {
      type: 'conversation.item.done',
      item: { id: 'i', type: 'function_call_output', call_id: 'c', output: '{"saved": tr' },
    };

    expect(after(broken)).toEqual(INITIAL_CONVERSATION);
  });
});

describe('a placement test', () => {
  const noted = (count: number, task: string, enough = false) =>
    toolResult({ noted: count, enough, task });

  it('has no part done at the start', () => {
    expect(after(SESSION_CREATED).tasksDone).toEqual([]);
  });

  it('knows each part of the test the examiner has noted, by name', () => {
    const state = after(noted(1, 'warm_up'), noted(2, 'listening'));

    expect(state.tasksDone).toEqual(['warm_up', 'listening']);
    expect(state.finished).toBe(false);
  });

  it('counts a part once however often its task is repeated', () => {
    // An easier warm-up after one that was too hard: the opinion task is still to come.
    const state = after(noted(1, 'warm_up'), noted(2, 'warm_up'), noted(3, 'listening'));

    expect(state.tasksDone).toEqual(['warm_up', 'listening']);
  });

  it('keeps what is done when the examiner is told to go on', () => {
    const state = after(
      noted(1, 'warm_up'),
      toolResult({ done: false, reason: 'too_few_tasks', noted: 1 }),
    );

    expect(state).toMatchObject({ tasksDone: ['warm_up'], finished: false });
  });

  it('is finished when the examiner ends the test', () => {
    const state = after(noted(5, 'follow_up', true), toolResult({ done: true }));

    expect(state).toMatchObject({ tasksDone: ['follow_up'], finished: true });
  });
});

describe('a typed line', () => {
  const typed = { type: 'learner.typed', id: 'typed_1', text: 'I don’t know.' };

  it('shows as the learner’s line and hands the turn to the persona', () => {
    const state = after(SESSION_CREATED, AUDIO_STARTED, AUDIO_STOPPED, typed);

    expect(state.captions.at(-1)).toEqual({
      id: 'typed_1',
      speaker: 'learner',
      text: 'I don’t know.',
      final: true,
    });
    expect(state.phase).toBe('thinking');
  });
});

it('ignores events it has no use for', () => {
  const noise = [
    { type: 'rate_limits.updated', rate_limits: [{ name: 'tokens', limit: 200000 }] },
    { type: 'response.content_part.added', part: { type: 'audio', transcript: '' } },
    { type: 'conversation.item.done', item: { id: 'i', type: 'message', role: 'assistant' } },
    'not an event',
    null,
  ];

  expect(after(...noise)).toEqual(INITIAL_CONVERSATION);
});

describe('help', () => {
  it('waits for the partner once the learner asked for help', () => {
    const listening = { ...INITIAL_CONVERSATION, phase: 'listening' as const };

    expect(conversationReducer(listening, { type: 'learner.help', kind: 'stuck' }).phase).toBe(
      'thinking',
    );
  });
});

describe('live corrections', () => {
  /** A note of the server's Live Error Spotter, as the call's data channel delivers it. */
  const note = (text: string, id = 'item_note') => ({
    type: 'conversation.item.done',
    event_id: 'event_10',
    previous_item_id: 'item_u',
    item: {
      id,
      object: 'realtime.item',
      type: 'message',
      status: 'completed',
      role: 'system',
      content: [{ type: 'input_text', text }],
    },
  });
  const PERFEKT = {
    said: 'Ich habe nach Berlin gefahren',
    better: 'Ich bin nach Berlin gefahren',
    why: 'Mit „fahren“ bildest du das Perfekt mit „sein“.',
    topic: 'perfekt_auxiliary',
    focus: true,
  };
  const correction = (turn: string, ...corrections: unknown[]) =>
    note(`live_correction: ${JSON.stringify({ turn, corrections })}`);

  it('are none at the start', () => {
    expect(INITIAL_CONVERSATION.corrections).toEqual([]);
  });

  it('arrive for the learner’s turn they are about', () => {
    const state = after(
      learnerDone('Ich habe nach Berlin gefahren.'),
      correction('item_u', PERFEKT),
    );

    expect(state.corrections).toEqual([{ turn: 'item_u', ...PERFEKT }]);
  });

  it('keep the order in which they were found', () => {
    const dative = { ...PERFEKT, said: 'mit der Bus', better: 'mit dem Bus', topic: 'case_dative' };

    const state = after(correction('item_u', PERFEKT), correction('item_v', dative));

    expect(state.corrections.map(({ turn, topic }) => [turn, topic])).toEqual([
      ['item_u', 'perfekt_auxiliary'],
      ['item_v', 'case_dative'],
    ]);
  });

  it('skip a correction that is not complete', () => {
    const state = after(correction('item_u', { ...PERFEKT, better: '' }, { said: 'x' }, PERFEKT));

    expect(state.corrections).toHaveLength(1);
  });

  it('ignore other notes and notes they cannot read', () => {
    const state = after(
      note('learner_help: slower'),
      note('live_correction: {not json'),
      note('live_correction: {"turn": 3, "corrections": []}'),
    );

    expect(state).toEqual(INITIAL_CONVERSATION);
  });
});
