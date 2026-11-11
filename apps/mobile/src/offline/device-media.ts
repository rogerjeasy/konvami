import { Directory, File, Paths } from 'expo-file-system';
import { isAvailableAsync, shareAsync } from 'expo-sharing';
import { printToFileAsync } from 'expo-print';
import type { LibraryMedia } from './library';

// Bounds device storage even when a provider accidentally returns an unexpectedly large file.
const MAX_MEDIA_BYTES = 200 * 1024 * 1024;
const mediaFolder = () => new Directory(Paths.document, 'recordings');
const mime = {
  txt: 'text/plain',
  tsv: 'text/tab-separated-values',
  md: 'text/markdown',
  json: 'application/json',
  pdf: 'application/pdf',
};

export const deviceLibraryMedia: LibraryMedia = {
  async download(url, key) {
    const folder = mediaFolder();
    folder.create({ idempotent: true, intermediates: true });
    const file = new File(folder, `${encodeURIComponent(key)}.wav`);
    try {
      await File.downloadFileAsync(url, file, { idempotent: true });
      if ((folder.size ?? 0) > MAX_MEDIA_BYTES) throw new Error('storage_limit');
      return file.uri;
    } catch (error) {
      if (file.exists) file.delete();
      throw error;
    }
  },
  async remove(uri) {
    const file = new File(uri);
    if (file.exists) file.delete();
  },
  async shareAudio(url, name, format) {
    if (!(await isAvailableAsync())) throw new Error('sharing_unavailable');
    const file = new File(Paths.cache, `${name}.${format}`);
    try {
      await File.downloadFileAsync(url, file, { idempotent: true });
      await shareAsync(file.uri, { mimeType: format === 'mp3' ? 'audio/mpeg' : 'audio/mp4' });
    } finally {
      if (file.exists) file.delete();
    }
  },
  async share(text, name, format) {
    if (!(await isAvailableAsync())) throw new Error('sharing_unavailable');
    const file =
      format === 'pdf'
        ? new File((await printToFileAsync({ html: text })).uri)
        : new File(Paths.cache, `${name}.${format}`);
    if (format !== 'pdf') file.write(text);
    try {
      await shareAsync(file.uri, { mimeType: mime[format] });
    } finally {
      if (file.exists) file.delete();
    }
  },
};
