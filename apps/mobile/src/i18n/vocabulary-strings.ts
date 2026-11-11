/** Vocabulary evidence and portable card exports (spec §6.7). */
export const VOCABULARY_TEXT = {
  en: {
    export: 'Export to Anki',
    exportFailed: 'The cards could not be exported. Try again.',
    exportHint: 'A text file of all saved cards, ready to import into Anki. Audio is not included.',
    active: 'Used correctly: {{count}}',
    passive: 'Heard only: {{count}}',
    evidence:
      'Tracked words from your conversations. Active words were checked in the sentences you said.',
  },
  de: {
    export: 'Für Anki exportieren',
    exportFailed: 'Die Karten konnten nicht exportiert werden. Versuche es erneut.',
    exportHint: 'Eine Textdatei aller gespeicherten Karten zum Importieren in Anki. Ohne Audio.',
    active: 'Richtig verwendet: {{count}}',
    passive: 'Nur gehört: {{count}}',
    evidence:
      'Erfasste Wörter aus deinen Gesprächen. Aktive Wörter wurden in deinen Sätzen geprüft.',
  },
  fr: {
    export: 'Exporter vers Anki',
    exportFailed: 'Impossible d’exporter les cartes. Réessaie.',
    exportHint:
      'Un fichier texte de toutes les cartes enregistrées, à importer dans Anki. Sans audio.',
    active: 'Utilisés correctement : {{count}}',
    passive: 'Seulement entendus : {{count}}',
    evidence:
      'Mots suivis dans tes conversations. Les mots actifs ont été vérifiés dans tes phrases.',
  },
  it: {
    export: 'Esporta per Anki',
    exportFailed: 'Non è stato possibile esportare le schede. Riprova.',
    exportHint: 'Un file di testo con tutte le schede salvate, da importare in Anki. Senza audio.',
    active: 'Usate correttamente: {{count}}',
    passive: 'Solo ascoltate: {{count}}',
    evidence:
      'Parole rilevate nelle tue conversazioni. Le parole attive sono state verificate nelle tue frasi.',
  },
} as const;
