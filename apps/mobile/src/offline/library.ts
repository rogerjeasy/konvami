import type { ApiClient, Transcript } from '@konvami/api-client';
import type { OfflineCache } from './cache';

export type TranscriptFormat = 'txt' | 'md' | 'json' | 'pdf';
export interface SpeakerLabels {
  learner: string;
  partner: string;
}
export interface Annotation {
  bookmarked: boolean;
  note: string;
}
export type Annotations = Record<string, Annotation>;
export interface LibraryMedia {
  download(url: string, key: string): Promise<string>;
  remove(uri: string): Promise<void>;
  resolve?(uri: string): Promise<string>;
  shareAudio?(url: string, name: string, format: 'mp3' | 'm4a'): Promise<void>;
  share(text: string, name: string, format: TranscriptFormat | 'tsv'): Promise<void>;
}
export interface LibraryTools {
  clear(): Promise<void>;
  clearRecordings(): Promise<void>;
  audioFormats(): Promise<string[]>;
  exportAudio(id: string, format: 'mp3' | 'm4a'): Promise<void>;
  annotations(id: string): Promise<Annotations>;
  annotate(id: string, turn: number, annotation: Annotation): Promise<void>;
  pinned(id: string): Promise<boolean>;
  pin(transcript: Transcript): Promise<void>;
  unpin(id: string): Promise<void>;
  local(transcript: Transcript): Promise<Transcript>;
  export(transcript: Transcript, format: TranscriptFormat, labels: SpeakerLabels): Promise<void>;
}
// A personal working library rather than an unlimited mirror of cloud audio.
const MAX_PINNED = 20;
export const MAX_NOTE_LENGTH = 2000;
interface Pinned {
  files: Record<string, string>;
  transcript: Transcript;
}
const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  );

export function exportTranscript(
  transcript: Transcript,
  format: TranscriptFormat,
  labels: SpeakerLabels,
): string {
  const { conversation, turns } = transcript;
  const rows = turns.map((turn) => ({
    speaker:
      turn.speaker === 'learner' ? labels.learner : (conversation.partner?.name ?? labels.partner),
    text: turn.verbatim ?? turn.text,
  }));
  const title = `${conversation.partner?.name ?? labels.partner} — ${conversation.startedAt}`;
  if (format === 'json')
    return JSON.stringify(
      {
        conversation: {
          id: conversation.id,
          startedAt: conversation.startedAt,
          seconds: conversation.seconds,
        },
        turns: rows,
      },
      null,
      2,
    );
  if (format === 'pdf')
    return `<!doctype html><html><meta charset="utf-8"><title>${escapeHtml(title)}</title><body><h1>${escapeHtml(title)}</h1>${rows.map((row) => `<p><strong>${escapeHtml(row.speaker)}:</strong> ${escapeHtml(row.text)}</p>`).join('')}</body></html>`;
  if (format === 'md')
    return `# ${title}\n\n${rows.map((row) => `**${row.speaker.replaceAll('*', '\\*')}:** ${row.text}`).join('\n\n')}\n`;
  return `${title}\n\n${rows.map((row) => `${row.speaker}: ${row.text}`).join('\n\n')}\n`;
}

export function createLibraryTools(
  cache: OfflineCache,
  media: LibraryMedia,
  api?: Pick<ApiClient, 'getRecordingFormats' | 'exportRecording'>,
): LibraryTools {
  let pending: Promise<unknown> = Promise.resolve();
  function serial<T>(action: () => Promise<T>): Promise<T> {
    const next = pending.then(action);
    pending = next.catch(() => {});
    return next;
  }
  const assertOwner = (owner: string | null) => {
    if (!owner || cache.account() !== owner) throw new Error('account_changed');
  };
  const pins = async () => (await cache.get<Record<string, Pinned>>('pinned')) ?? {};
  async function clearPins() {
    const owner = cache.account();
    const saved = await pins();
    for (const item of Object.values(saved))
      await Promise.all(Object.values(item.files).map((uri) => media.remove(uri)));
    assertOwner(owner);
    await cache.remove('pinned');
  }
  return {
    clearRecordings: () => serial(clearPins),
    audioFormats: async () =>
      api && media.shareAudio ? (await api.getRecordingFormats()).formats : [],
    exportAudio: async (id, format) => {
      if (!api || !media.shareAudio) throw new Error('sharing_unavailable');
      const owner = cache.account();
      const { url } = await api.exportRecording(id, format);
      assertOwner(owner);
      await media.shareAudio(url, `conversation-${encodeURIComponent(id)}`, format);
    },
    clear: () =>
      serial(async () => {
        await clearPins();
        await cache.clear();
      }),
    annotations: async (id) => (await cache.get<Annotations>(`annotations:${id}`)) ?? {},
    annotate: (id, turn, annotation) =>
      serial(async () => {
        if (!Number.isSafeInteger(turn) || turn < 0 || annotation.note.length > MAX_NOTE_LENGTH)
          throw new Error('invalid_note');
        const owner = cache.account();
        const values = (await cache.get<Annotations>(`annotations:${id}`)) ?? {};
        assertOwner(owner);
        values[String(turn)] = { bookmarked: annotation.bookmarked, note: annotation.note.trim() };
        await cache.put(`annotations:${id}`, values);
      }),
    pinned: async (id) => Boolean((await pins())[id]),
    pin: (transcript) =>
      serial(async () => {
        const owner = cache.account();
        if (!owner) throw new Error('signed_out');
        const saved = await pins();
        const id = transcript.conversation.id;
        if (saved[id]) return;
        if (Object.keys(saved).length >= MAX_PINNED) throw new Error('pin_limit');
        const files: Record<string, string> = {};
        try {
          for (const [index, turn] of transcript.turns.entries()) {
            if (!turn.audio) continue;
            files[String(index)] = await media.download(turn.audio.url, `${owner}/${id}/${index}`);
            if (cache.account() !== owner) throw new Error('account_changed');
          }
          assertOwner(owner);
          saved[id] = { files, transcript };
          await cache.put(`transcript:${id}`, transcript);
          assertOwner(owner);
          await cache.put('pinned', saved);
        } catch (error) {
          await Promise.allSettled(Object.values(files).map((uri) => media.remove(uri)));
          throw error;
        }
      }),
    unpin: (id) =>
      serial(async () => {
        const owner = cache.account();
        const saved = await pins();
        const found = saved[id];
        if (!found) return;
        await Promise.all(Object.values(found.files).map((uri) => media.remove(uri)));
        delete saved[id];
        assertOwner(owner);
        await cache.put('pinned', saved);
      }),
    async local(transcript) {
      const pinned = (await pins())[transcript.conversation.id];
      if (!pinned) return transcript;
      return {
        ...transcript,
        turns: await Promise.all(
          transcript.turns.map(async (turn, index) => {
            const uri = pinned.files[String(index)];
            return uri && turn.audio
              ? {
                  ...turn,
                  audio: { ...turn.audio, url: media.resolve ? await media.resolve(uri) : uri },
                }
              : turn;
          }),
        ),
      };
    },
    export: (transcript, format, labels) =>
      media.share(
        exportTranscript(transcript, format, labels),
        `conversation-${encodeURIComponent(transcript.conversation.id)}`,
        format,
      ),
  };
}
