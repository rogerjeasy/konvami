/** Exam task stages and original picture descriptions (spec §6.13). */
export const EXAM_STAGES = {
  en: {
    next: 'Prepare the next stage',
    speaking: 'Speaking time',
    stage: 'Practice stage {{stage}} of {{total}}',
    body: 'Paper-based TestDaF speaking practice in seven stages. Each keeps its preparation and speaking time. Your next stage is suggested after scoring.',
    waiting_room: 'A family waiting at a doctor’s office',
    bus_stop: 'People waiting at a bus stop in the rain',
  },
  de: {
    next: 'Nächste Etappe vorbereiten',
    speaking: 'Sprechzeit',
    stage: 'Übungsetappe {{stage}} von {{total}}',
    body: 'Sprechtraining für den papierbasierten TestDaF in sieben Etappen, jeweils mit eigener Vorbereitungs- und Sprechzeit. Nach der Bewertung wird die nächste Etappe vorgeschlagen.',
    waiting_room: 'Eine Familie wartet in einem ärztlichen Wartezimmer',
    bus_stop: 'Menschen warten bei Regen an einer Bushaltestelle',
  },
  fr: {
    next: 'Préparer la prochaine étape',
    speaking: 'Temps de parole',
    stage: 'Étape d’entraînement {{stage}} sur {{total}}',
    body: 'Entraînement oral au TestDaF papier en sept étapes, chacune avec son temps de préparation et de parole. La prochaine étape est proposée après l’évaluation.',
    waiting_room: 'Une famille attend dans une salle d’attente médicale',
    bus_stop: 'Des personnes attendent à un arrêt de bus sous la pluie',
  },
  it: {
    next: 'Prepara la prossima tappa',
    speaking: 'Tempo di risposta',
    stage: 'Tappa di pratica {{stage}} di {{total}}',
    body: 'Pratica orale per il TestDaF cartaceo in sette tappe, ciascuna con il proprio tempo di preparazione e di risposta. Dopo la valutazione viene suggerita la tappa successiva.',
    waiting_room: 'Una famiglia aspetta nella sala d’attesa di uno studio medico',
    bus_stop: 'Persone aspettano alla fermata dell’autobus sotto la pioggia',
  },
} as const;
