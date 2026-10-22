/**
 * What the conversation screen shows, worked out from the events of a live voice call. The
 * events arrive over the call's data channel from the voice provider; this is a pure reducer, so
 * every rule is unit tested without a call.
 */

export type ConversationPhase =
  /** The call is being set up. */
  | 'connecting'
  /** The persona is preparing a reply. */
  | 'thinking'
  /** The persona's voice is playing. */
  | 'speaking'
  /** Waiting for the learner to speak. */
  | 'listening'
  /** The learner is speaking. */
  | 'hearing';

export interface Caption {
  id: string;
  speaker: 'persona' | 'learner';
  text: string;
  /** False while the line is still being spoken or transcribed. */
  final: boolean;
}

export interface ConversationState {
  phase: ConversationPhase;
  /** The most recent lines, oldest first. */
  captions: Caption[];
  /** The questions the server still misses; null until it has reported once. */
  stillOpen: string[] | null;
  /** The parts of a placement test the examiner has noted so far, each once, in order. */
  tasksDone: string[];
  /** The server has confirmed that everything is answered, or that the test is over. */
  finished: boolean;
  /** Finished, and the persona's goodbye has been heard: the screen can move on. */
  over: boolean;
}

export const INITIAL_CONVERSATION: ConversationState = {
  phase: 'connecting',
  captions: [],
  stillOpen: null,
  tasksDone: [],
  finished: false,
  over: false,
};

// Lines kept for the captions; older ones drop off.
const MAX_CAPTIONS = 8;

type Event = { type?: unknown } & Record<string, unknown>;

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

function withCaption(
  state: ConversationState,
  speaker: Caption['speaker'],
  id: string,
  change: (current: string) => string,
  final: boolean,
): ConversationState {
  if (!id) return state;
  const existing = state.captions.find((caption) => caption.id === id);
  const next = change(existing?.text ?? '');
  if (!next.trim()) {
    // Nothing was said after all: an empty line is not shown.
    return existing ? { ...state, captions: state.captions.filter((c) => c.id !== id) } : state;
  }
  const caption: Caption = { id, speaker, text: final ? next.trim() : next, final };
  const captions = existing
    ? state.captions.map((c) => (c.id === id ? caption : c))
    : [...state.captions, caption].slice(-MAX_CAPTIONS);
  return { ...state, captions };
}

/** What a server-side tool reported: progress, or the end of the setup or the test. */
function withToolResult(state: ConversationState, output: unknown): ConversationState {
  let result: unknown;
  try {
    result = JSON.parse(text(output));
  } catch {
    return state;
  }
  if (typeof result !== 'object' || result === null) return state;
  const {
    done,
    still_open: stillOpen,
    task,
  } = result as { done?: unknown; still_open?: unknown; task?: unknown };
  if (done === true) return { ...state, finished: true, stillOpen: [] };
  if (Array.isArray(stillOpen)) {
    return { ...state, stillOpen: stillOpen.filter((q): q is string => typeof q === 'string') };
  }
  if (typeof task === 'string' && !state.tasksDone.includes(task)) {
    return { ...state, tasksDone: [...state.tasksDone, task] };
  }
  return state;
}

export function conversationReducer(state: ConversationState, event: unknown): ConversationState {
  if (typeof event !== 'object' || event === null) return state;
  const e = event as Event;
  switch (e.type) {
    case 'session.created':
      // The persona speaks first, so the wait that follows is hers.
      return { ...state, phase: 'thinking' };
    case 'response.created':
      return state.phase === 'speaking' ? state : { ...state, phase: 'thinking' };
    case 'output_audio_buffer.started':
      return { ...state, phase: 'speaking' };
    case 'output_audio_buffer.stopped':
    case 'output_audio_buffer.cleared':
      return { ...state, phase: 'listening', over: state.finished };
    case 'input_audio_buffer.speech_started':
      return { ...state, phase: 'hearing' };
    case 'input_audio_buffer.speech_stopped':
      return { ...state, phase: 'thinking' };
    case 'response.output_audio_transcript.delta':
      return withCaption(state, 'persona', text(e.item_id), (t) => t + text(e.delta), false);
    case 'response.output_audio_transcript.done':
      return withCaption(state, 'persona', text(e.item_id), () => text(e.transcript), true);
    case 'conversation.item.input_audio_transcription.delta':
      return withCaption(state, 'learner', text(e.item_id), (t) => t + text(e.delta), false);
    case 'conversation.item.input_audio_transcription.completed':
      return withCaption(state, 'learner', text(e.item_id), () => text(e.transcript), true);
    case 'learner.typed':
      // Sent by the app itself (`VoiceEngine.say`): the provider does not echo typed text.
      return {
        ...withCaption(state, 'learner', text(e.id), () => text(e.text), true),
        phase: 'thinking',
      };
    case 'learner.help':
      // Sent by the app itself (`VoiceEngine.help`): the partner answers it next.
      return { ...state, phase: 'thinking' };
    case 'conversation.item.done': {
      const item = e.item as { type?: unknown; output?: unknown } | undefined;
      return item?.type === 'function_call_output' ? withToolResult(state, item.output) : state;
    }
    default:
      return state;
  }
}
