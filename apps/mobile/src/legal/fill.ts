import { formatDate } from '@/lib/format';
import type { LegalSettings, Span } from './types';

/** The settings that are still empty. While any is, the pages are a draft (the site refuses to
 * be built in that state, the app shows a notice). */
export function missingLegalSettings(settings: LegalSettings): string[] {
  return Object.entries(settings.controller)
    .filter(([, value]) => value.trim() === '')
    .map(([key]) => `controller.${key}`);
}

/**
 * Puts the settings into `{{name}}` placeholders. A setting that is empty becomes `unset`, so a
 * page never shows a blank where a name belongs. An unknown name is an error: the content and
 * the settings are checked together by a test.
 */
export function fillLegalText(
  text: string,
  settings: LegalSettings,
  language: string,
  unset: string,
): string {
  const values: Record<string, string> = {
    'controller.name': settings.controller.name.trim() || unset,
    'controller.address': settings.controller.address.trim() || unset,
    'controller.email': settings.controller.email.trim() || unset,
    updated: formatDate(language, settings.updated),
  };
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, name: string) => {
    const value = values[name];
    if (value === undefined) throw new Error(`Unknown placeholder {{${name}}}`);
    return value;
  });
}

/** The same for a run of text. */
export function fillSpans(
  spans: readonly Span[],
  settings: LegalSettings,
  language: string,
  unset: string,
): Span[] {
  return spans.map((span) => ({
    ...span,
    text: fillLegalText(span.text, settings, language, unset),
  }));
}
