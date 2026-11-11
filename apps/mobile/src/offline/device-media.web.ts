import type { LibraryMedia } from './library';

// Give the browser time to consume a download URL before releasing its memory.
const DOWNLOAD_RELEASE_MS = 1000;
const CACHE_NAME = 'konvami-recordings-v1';
const MAX_FILE_BYTES = 40 * 1024 * 1024;
const objectUrls = new Map<string, string>();
const prefix = '/offline-recordings/';
export const deviceLibraryMedia: LibraryMedia = {
  async download(url, key) {
    const response = await fetch(url);
    if (!response.ok) throw new Error('download_failed');
    const blob = await response.blob();
    if (blob.size > MAX_FILE_BYTES) throw new Error('storage_limit');
    const address = `${prefix}${encodeURIComponent(key)}`;
    await (await caches.open(CACHE_NAME)).put(address, new Response(blob));
    return address;
  },
  async resolve(uri) {
    if (!uri.startsWith(prefix)) return uri;
    const existing = objectUrls.get(uri);
    if (existing) return existing;
    const response = await (await caches.open(CACHE_NAME)).match(uri);
    if (!response) throw new Error('recording_missing');
    const url = URL.createObjectURL(await response.blob());
    objectUrls.set(uri, url);
    return url;
  },
  async remove(uri) {
    const url = objectUrls.get(uri);
    if (url) URL.revokeObjectURL(url);
    objectUrls.delete(uri);
    await (await caches.open(CACHE_NAME)).delete(uri);
  },
  async shareAudio(url, name, format) {
    const response = await fetch(url);
    if (!response.ok) throw new Error('download_failed');
    const blob = await response.blob();
    const object = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = object;
    link.download = `${name}.${format}`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(object), DOWNLOAD_RELEASE_MS);
  },
  async share(text, name, format) {
    if (format === 'pdf') {
      const popup = window.open('', '_blank');
      if (!popup) throw new Error('sharing_unavailable');
      popup.document.write(text);
      popup.document.close();
      popup.focus();
      popup.print();
      return;
    }
    const mime =
      format === 'json'
        ? 'application/json'
        : format === 'tsv'
          ? 'text/tab-separated-values;charset=utf-8'
          : 'text/plain;charset=utf-8';
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${name}.${format}`;
    link.click();
    // The browser consumes the URL asynchronously after the click.
    setTimeout(() => URL.revokeObjectURL(url), DOWNLOAD_RELEASE_MS);
  },
};
