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

/**
 * A mistake the server's Live Error Spotter found in one of the learner's turns (spec §6.4
 * correction chips). The report after the call checks every mistake again.
 */
export interface LiveCorrection {
  /** The id of the learner's turn it is about. */
  turn: string;
  /** The learner's words, and the same words put right. */
  said: string;
  better: string;
  /** Why, in one sentence in the learner's explanation language. */
  why: string;
  /** The language pack's kind of mistake (`report.category.*`). */
  topic: string;
  /** One of the kinds this conversation's plan practises. */
  focus: boolean;
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
  /** What the Live Error Spotter found, in the order it was found. */
  corrections: LiveCorrection[];
  /** Everything the learner said in the call, final lines only (captions keep the latest). */
  learnerLines: string[];
}

export const INITIAL_CONVERSATION: ConversationState = {
  phase: 'connecting',
  captions: [],
  stillOpen: null,
  tasksDone: [],
  finished: false,
  over: false,
  corrections: [],
  learnerLines: [],
};

/**
 * How the server tells a live correction: a system note `live_correction: <JSON>` added to the
 * conversation, which the partner reads too (services/api, `domain/live_call.py`:
 * `LIVE_CORRECTION_NOTE`).
 */
export const LIVE_CORRECTION_NOTE = 'live_correction: ';

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

function withLearnerLine(state: ConversationState, line: string): ConversationState {
  return line.trim() ? { ...state, learnerLines: [...state.learnerLines, line.trim()] } : state;
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

const isText = (value: unknown): value is string =>
  typeof value === 'string' && value.trim() !== '';

/** The corrections in a system note of the Live Error Spotter; none for any other note. */
function noteCorrections(item: { role?: unknown; content?: unknown }): LiveCorrection[] {
  if (item.role !== 'system' || !Array.isArray(item.content)) return [];
  const part = item.content[0] as { text?: unknown } | undefined;
  const note = text(part?.text);
  if (!note.startsWith(LIVE_CORRECTION_NOTE)) return [];
  let found: unknown;
  try {
    found = JSON.parse(note.slice(LIVE_CORRECTION_NOTE.length));
  } catch {
    return [];
  }
  const { turn, corrections } = (found ?? {}) as { turn?: unknown; corrections?: unknown };
  if (!isText(turn) || !Array.isArray(corrections)) return [];
  return corrections.flatMap((entry: unknown) => {
    const c = (entry ?? {}) as Record<string, unknown>;
    if (!isText(c.said) || !isText(c.better) || !isText(c.why) || !isText(c.topic)) return [];
    return [
      { turn, said: c.said, better: c.better, why: c.why, topic: c.topic, focus: c.focus === true },
    ];
  });
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
      return withLearnerLine(
        withCaption(state, 'learner', text(e.item_id), () => text(e.transcript), true),
        text(e.transcript),
      );
    case 'learner.typed':
      // Sent by the app itself (`VoiceEngine.say`): the provider does not echo typed text.
      return {
        ...withLearnerLine(
          withCaption(state, 'learner', text(e.id), () => text(e.text), true),
          text(e.text),
        ),
        phase: 'thinking',
      };
    case 'learner.help':
      // Sent by the app itself (`VoiceEngine.help`): the partner answers it next.
      return { ...state, phase: 'thinking' };
    case 'conversation.item.done': {
      const item = e.item as
        { type?: unknown; output?: unknown; role?: unknown; content?: unknown } | undefined;
      if (item?.type === 'function_call_output') return withToolResult(state, item.output);
      const found = item?.type === 'message' ? noteCorrections(item) : [];
      return found.length ? { ...state, corrections: [...state.corrections, ...found] } : state;
    }
    default:
      return state;
  }
}
