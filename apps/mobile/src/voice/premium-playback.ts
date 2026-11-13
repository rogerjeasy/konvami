import type { ClipPlayer } from '@/lib/clip-player';

interface Reply {
  id: string;
  text: string;
  url: string;
  milliseconds: number;
}
export const PREMIUM_AUDIO_NOTE = 'premium_audio: ';
// A live turn is bounded by the call limit; reject malformed receipts before playing them.
const MAX_TURN_MS = 10 * 60 * 1000;

function replyOf(event: unknown): Reply | null {
  const e = event as {
    type?: string;
    item?: { role?: string; content?: { text?: string }[] };
  } | null;
  if (e?.type !== 'conversation.item.done' || e.item?.role !== 'system') return null;
  const note = e.item.content?.find((part) => part.text?.startsWith(PREMIUM_AUDIO_NOTE))?.text;
  if (!note) return null;
  try {
    const reply = JSON.parse(note.slice(PREMIUM_AUDIO_NOTE.length)) as Partial<Reply>;
    return typeof reply.id === 'string' &&
      typeof reply.text === 'string' &&
      typeof reply.url === 'string' &&
      reply.url.startsWith('https://') &&
      typeof reply.milliseconds === 'number' &&
      Number.isFinite(reply.milliseconds) &&
      reply.milliseconds > 0 &&
      reply.milliseconds <= MAX_TURN_MS
      ? (reply as Reply)
      : null;
  } catch {
    return null;
  }
}

/** Local playback shares the same caption and speaking-state events as WebRTC audio. */
export function premiumPlayback(clips: ClipPlayer, emit: (event: unknown) => void) {
  const seen = new Set<string>();
  let generation = 0;
  const stop = () => {
    generation += 1;
    clips.stop();
  };
  return {
    stop,
    handle(event: unknown) {
      const kind = (event as { type?: string } | null)?.type;
      if (kind === 'input_audio_buffer.speech_started') stop();
      const reply = replyOf(event);
      if (!reply || seen.has(reply.id)) return;
      seen.add(reply.id);
      stop();
      const current = generation;
      emit({
        type: 'response.output_audio_transcript.done',
        item_id: reply.id,
        transcript: reply.text,
      });
      emit({ type: 'output_audio_buffer.started' });
      clips.play(
        reply.url,
        () => {
          if (current === generation) emit({ type: 'output_audio_buffer.stopped' });
        },
        reply.milliseconds,
      );
    },
  };
}
