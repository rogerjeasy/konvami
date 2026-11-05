/**
 * What a crash report may carry (spec §6.21.4). The app's screens show a learner's own words, so a
 * report must never hold what was on the screen. This keeps the error's type, its stack and the
 * device, operating system and app it ran on, and replaces every piece of free text: an error
 * message can quote a sentence the learner said or a name they typed, and no pattern can tell
 * which messages do. Only a short machine code (`not_found`, `network`) is kept as it is.
 */

/** What stands in for a message that is not a plain code. */
export const REDACTED = '[redacted]';

/** The parts of an event's `contexts` that describe the phone and the app, not the person. */
const SAFE_CONTEXTS = ['device', 'os', 'app', 'runtime'] as const;

// An error code such as `not_found`: lowercase words joined by underscores. It needs an
// underscore, because a single lowercase word is as likely to be something a learner said.
const CODE = /^[a-z]+(_[a-z0-9]+)+$/;
// The few codes that are one word, spelled out so nothing else passes as one.
const SINGLE_WORD_CODES: ReadonlySet<string> = new Set(['network', 'unauthorized', 'unknown']);

interface Frame {
  function?: string;
  vars?: unknown;
}

/** The parts of a Sentry event this touches; everything else passes through unchanged. */
export interface ScrubbableEvent {
  request?: unknown;
  user?: unknown;
  breadcrumbs?: unknown;
  extra?: unknown;
  tags?: unknown;
  logentry?: unknown;
  server_name?: unknown;
  message?: string;
  contexts?: Record<string, unknown>;
  exception?: {
    values?: {
      value?: string;
      mechanism?: { data?: unknown };
      stacktrace?: { frames?: Frame[] };
    }[];
  };
}

const text = (value: string) =>
  CODE.test(value) || SINGLE_WORD_CODES.has(value) ? value : REDACTED;

export function scrubEvent<E extends ScrubbableEvent>(event: E): E {
  delete event.request;
  delete event.user;
  delete event.breadcrumbs;
  delete event.extra;
  delete event.tags;
  delete event.logentry;
  delete event.server_name;
  if (typeof event.message === 'string') event.message = text(event.message);
  if (event.contexts) {
    const kept: Record<string, unknown> = {};
    for (const name of SAFE_CONTEXTS) if (name in event.contexts) kept[name] = event.contexts[name];
    event.contexts = kept;
  }
  for (const value of event.exception?.values ?? []) {
    if (typeof value.value === 'string') value.value = text(value.value);
    delete value.mechanism?.data;
    for (const frame of value.stacktrace?.frames ?? []) delete frame.vars;
  }
  return event;
}
