/**
 * What a crash report may carry (spec §6.21.4). The app's screens show a learner's own words, so a
 * report must never hold what was on the screen: this keeps the error, its stack and the device
 * model, and drops everything that could hold text a person wrote or an address.
 */

/** Letters of an error message kept: a message can quote text the learner typed or said. */
export const MAX_MESSAGE_LENGTH = 120;

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;

interface Frame {
  vars?: unknown;
}

/** The parts of a Sentry event this touches; everything else passes through unchanged. */
export interface ScrubbableEvent {
  request?: unknown;
  user?: unknown;
  breadcrumbs?: unknown;
  extra?: unknown;
  server_name?: unknown;
  message?: string;
  exception?: {
    values?: { value?: string; stacktrace?: { frames?: Frame[] } }[];
  };
}

const scrubbed = (text: string) => text.replace(EMAIL, '[email]').slice(0, MAX_MESSAGE_LENGTH);

export function scrubEvent<E extends ScrubbableEvent>(event: E): E {
  delete event.request;
  delete event.user;
  delete event.breadcrumbs;
  delete event.extra;
  delete event.server_name;
  if (typeof event.message === 'string') event.message = scrubbed(event.message);
  for (const value of event.exception?.values ?? []) {
    if (typeof value.value === 'string') value.value = scrubbed(value.value);
    for (const frame of value.stacktrace?.frames ?? []) delete frame.vars;
  }
  return event;
}
