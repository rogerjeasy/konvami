/**
 * The help a learner can ask for during a conversation (spec §6.4 help buttons). The app sends
 * only the kind; what each means is in the partner's instructions on the server
 * (services/api, `domain/practice.py`: `HELP_NOTE`).
 */
export const HELP_KINDS = ['stuck', 'slower', 'repeat', 'translate', 'explain'] as const;
export type HelpKind = (typeof HELP_KINDS)[number];

/** The note the partner gets for a kind of help: the same words as `HELP_NOTE` on the server. */
export const helpNote = (kind: HelpKind) => `learner_help: ${kind}`;
