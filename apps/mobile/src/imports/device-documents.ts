import { Platform } from 'react-native';
import { File } from 'expo-file-system';
import { getDocumentAsync } from 'expo-document-picker';
import { ApiError } from '@konvami/api-client';
import { createPictureSender } from '@/profile/pictures';
import { DOCUMENT_MAX_BYTES, type ImportDocuments } from './documents';

export const deviceImportDocuments: ImportDocuments = {
  async pick(kind) {
    const type = kind === 'pdf' ? 'application/pdf' : 'audio/mpeg';
    const result = await getDocumentAsync({ type, copyToCacheDirectory: true, multiple: false });
    if (result.canceled) return null;
    const file = result.assets[0];
    if (!file || !file.size || file.size > DOCUMENT_MAX_BYTES) throw new ApiError('invalid_value');
    return { uri: file.uri, type };
  },
  async release(document) {
    if (Platform.OS === 'web') {
      if (document.uri.startsWith('blob:')) URL.revokeObjectURL(document.uri);
    } else {
      const file = new File(document.uri);
      if (file.exists) file.delete();
    }
  },
  async send(upload, document) {
    const send = createPictureSender({
      fetch: (url, init) => fetch(url, init),
      filePart: async ({ uri }) =>
        Platform.OS === 'web'
          ? (await fetch(uri)).blob()
          : {
              uri,
              name: document.type === 'application/pdf' ? 'material.pdf' : 'material.mp3',
              type: document.type,
            },
    });
    await send(upload, document);
  },
};
