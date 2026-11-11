import { Directory, File, Paths } from 'expo-file-system';
import type { OfflineDisk } from './cache';

const directory = () => new Directory(Paths.document, 'learning');
const document = (key: string) => new File(directory(), `${encodeURIComponent(key)}.json`);

/** Private app documents survive restarts; a temporary file is renamed only after a full write. */
export const deviceOfflineDisk: OfflineDisk = {
  async read(key) {
    const file = document(key);
    return file.exists ? file.text() : null;
  },
  async write(key, value) {
    directory().create({ intermediates: true, idempotent: true });
    const temporary = new File(directory(), `${encodeURIComponent(key)}.tmp`);
    temporary.write(value);
    await temporary.move(document(key), { overwrite: true });
  },
  async remove(key) {
    const file = document(key);
    if (file.exists) file.delete();
  },
};
