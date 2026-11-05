import type { Language } from '@/i18n/languages';

/** The legal pages the app shows itself (6.18). */
export const LEGAL_PAGES = ['terms', 'privacy'] as const;
export type LegalPage = (typeof LEGAL_PAGES)[number];

/** Text with some of it in bold. */
export type Span = { text: string; bold?: true };

export type Block =
  | { kind: 'heading'; text: string }
  | { kind: 'paragraph'; spans: Span[] }
  | { kind: 'list'; items: Span[][] };

export type LegalDocument = { title: string; blocks: Block[] };

export type LegalDocuments = Record<Language, Record<LegalPage, LegalDocument>>;

/** Who is responsible for the data and when the pages last changed (apps/site/site.config.ts). */
export type LegalSettings = {
  controller: { name: string; address: string; email: string };
  /** The day the content last changed, YYYY-MM-DD. */
  updated: string;
};
