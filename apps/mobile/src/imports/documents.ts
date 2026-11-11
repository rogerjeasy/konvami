import type { PictureUpload } from '@konvami/api-client';

export type DocumentKind = 'pdf' | 'audio';
export interface ImportDocument {
  uri: string;
  type: 'application/pdf' | 'audio/mpeg';
}
/** The same bound as import uploads on the server, before any bytes leave the device. */
export const DOCUMENT_MAX_BYTES = 4 * 1024 * 1024;
export interface ImportDocuments {
  pick(kind: DocumentKind): Promise<ImportDocument | null>;
  release?(document: ImportDocument): Promise<void>;
  send(upload: PictureUpload, document: ImportDocument): Promise<void>;
}
