/** Explicit, per-simulation consent and separate acoustic observations (spec §6.13). */
export const EXAM_ACOUSTICS = {
  en: {
    optIn: 'Include pronunciation feedback',
    consent:
      'For this simulation, I agree to send my recorded answers to {{provider}} for pronunciation analysis. Temporary exam audio is deleted after scoring. Up to three minutes are assessed; longer answers require word alignment. This optional estimate does not change the exam grade.',
    title: 'Pronunciation estimate',
    separate:
      'Measured from your audio by {{provider}}. Separate from the exam rubric and never an official mark.',
    coverage:
      '{{turns}} answers assessed · {{seconds}} seconds · {{skipped}} answers partly or entirely skipped',
    missing: 'No usable acoustic assessment was available. Your transcript score is unchanged.',
    accuracy: 'Sound accuracy',
    fluency: 'Fluency',
    prosody: 'Stress and rhythm',
    metric: '{{value}} / 100',
  },
  de: {
    optIn: 'Aussprachefeedback hinzufügen',
    consent:
      'Für diese Simulation stimme ich zu, meine aufgenommenen Antworten zur Ausspracheanalyse an {{provider}} zu senden. Die temporären Prüfungsaufnahmen werden nach der Bewertung gelöscht. Bis zu drei Minuten werden analysiert; längere Antworten benötigen Wortzeitmarken. Diese freiwillige Einschätzung ändert die Prüfungsnote nicht.',
    title: 'Ausspracheeinschätzung',
    separate:
      'Von {{provider}} anhand deiner Aufnahme gemessen. Getrennt vom Prüfungsraster und keine offizielle Note.',
    coverage:
      '{{turns}} Antworten analysiert · {{seconds}} Sekunden · {{skipped}} Antworten teilweise oder ganz übersprungen',
    missing:
      'Keine nutzbare Ausspracheanalyse verfügbar. Deine Transkriptbewertung bleibt unverändert.',
    accuracy: 'Lautgenauigkeit',
    fluency: 'Sprechflüssigkeit',
    prosody: 'Betonung und Rhythmus',
    metric: '{{value}} / 100',
  },
  fr: {
    optIn: 'Ajouter un retour sur la prononciation',
    consent:
      'Pour cette simulation, j’accepte d’envoyer mes réponses enregistrées à {{provider}} pour analyser ma prononciation. Les enregistrements temporaires sont supprimés après la notation. Trois minutes au maximum sont analysées ; les réponses plus longues nécessitent un alignement des mots. Cette estimation facultative ne change pas la note de l’examen.',
    title: 'Estimation de la prononciation',
    separate:
      'Mesurée à partir de ton audio par {{provider}}. Séparée du barème et jamais une note officielle.',
    coverage:
      '{{turns}} réponses analysées · {{seconds}} secondes · {{skipped}} réponses ignorées en partie ou en totalité',
    missing: 'Aucune analyse acoustique exploitable. La note de ta transcription reste inchangée.',
    accuracy: 'Précision des sons',
    fluency: 'Fluidité',
    prosody: 'Accentuation et rythme',
    metric: '{{value}} / 100',
  },
  it: {
    optIn: 'Includi un riscontro sulla pronuncia',
    consent:
      'Per questa simulazione acconsento a inviare le mie risposte registrate a {{provider}} per l’analisi della pronuncia. Le registrazioni temporanee vengono eliminate dopo la valutazione. Vengono analizzati al massimo tre minuti; le risposte più lunghe richiedono l’allineamento delle parole. Questa stima facoltativa non modifica il voto dell’esame.',
    title: 'Stima della pronuncia',
    separate:
      'Misurata dal tuo audio da {{provider}}. Separata dai criteri dell’esame e mai un voto ufficiale.',
    coverage:
      '{{turns}} risposte analizzate · {{seconds}} secondi · {{skipped}} risposte saltate in parte o del tutto',
    missing:
      'Nessuna analisi acustica utilizzabile. Il punteggio della trascrizione resta invariato.',
    accuracy: 'Precisione dei suoni',
    fluency: 'Fluidità',
    prosody: 'Accento e ritmo',
    metric: '{{value}} / 100',
  },
} as const;
