import { Marked, type Token } from 'marked';
import { markSvg } from '@konvami/design-tokens';

/** The site's languages: the app's UI languages (a test keeps them equal). */
export const LANGUAGES = ['en', 'de', 'fr', 'it'] as const;
export type Language = (typeof LANGUAGES)[number];

/** The pages, each written once per language under content/<page>/<lang>.md. */
export const PAGES = ['privacy'] as const;
export type Page = (typeof PAGES)[number];

/** Each language's name in itself, for the language switcher. */
const LANGUAGE_NAMES: Record<Language, string> = {
  en: 'English',
  de: 'Deutsch',
  fr: 'Français',
  it: 'Italiano',
};

/** The switcher's label for screen readers. */
const LANGUAGE_NAV_LABEL: Record<Language, string> = {
  en: 'Language',
  de: 'Sprache',
  fr: 'Langue',
  it: 'Lingua',
};

/** What the pages say about who is responsible for the data, and when they last changed. */
export type Settings = {
  controller: { name: string; address: string; email: string };
  /** The day the content last changed, YYYY-MM-DD. */
  updated: string;
};

/** Where a page is published, relative to the site root. The app opens the same address. */
export function pagePath(lang: Language, page: Page): string {
  return `${lang}/${page}.html`;
}

/** The settings still empty. A page with a blank where the controller's name belongs must not
 * be published, so the build stops while this list is not empty. */
export function missingSettings(settings: Settings): string[] {
  return Object.entries(settings.controller)
    .filter(([, value]) => value.trim() === '')
    .map(([key]) => `controller.${key}`);
}

/** Replaces each `{{name}}` with its setting. An unknown name is an error, never left as is. */
export function fillPlaceholders(text: string, settings: Settings, lang: Language): string {
  const values: Record<string, string> = {
    'controller.name': settings.controller.name,
    'controller.address': settings.controller.address,
    'controller.email': settings.controller.email,
    // Noon UTC, so the day is the same in every time zone the formatter might use.
    updated: new Intl.DateTimeFormat(lang, { dateStyle: 'long', timeZone: 'UTC' }).format(
      new Date(`${settings.updated}T12:00:00Z`),
    ),
  };
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, name: string) => {
    const value = values[name];
    if (value === undefined) throw new Error(`Unknown placeholder {{${name}}}`);
    return value;
  });
}

// The content is Markdown only: raw HTML could carry scripts or break the page's layout.
const markdown = new Marked({
  gfm: true,
  walkTokens(token: Token) {
    if (token.type === 'html') throw new Error(`Raw HTML is not allowed in content: ${token.raw}`);
  },
});

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** The page's title: its first heading, as plain text. */
export function titleOf(source: string): string {
  const heading = source.match(/^#\s+(.+)$/m)?.[1];
  if (!heading) throw new Error('A page must start with a level-1 heading');
  return heading.trim();
}

export function renderPage({
  lang,
  page,
  markdown: source,
  settings,
}: {
  lang: Language;
  page: Page;
  markdown: string;
  settings: Settings;
}): string {
  const filled = fillPlaceholders(source, settings, lang);
  const body = markdown.parse(filled, { async: false });
  const switcher = LANGUAGES.map((other) =>
    other === lang
      ? `<li><span aria-current="page">${LANGUAGE_NAMES[other]}</span></li>`
      : `<li><a href="../${pagePath(other, page)}" hreflang="${other}" lang="${other}">${LANGUAGE_NAMES[other]}</a></li>`,
  ).join('');

  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(titleOf(filled))} · Konvami</title>
<link rel="icon" href="../favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="../styles.css">
</head>
<body>
<header class="masthead">
<a class="brand" href="../index.html"><span class="mark" aria-hidden="true">${markSvg({ tile: 'rounded' })}</span>Konvami</a>
<nav aria-label="${LANGUAGE_NAV_LABEL[lang]}"><ul class="languages">${switcher}</ul></nav>
</header>
<main>
${body}
</main>
</body>
</html>
`;
}

/** The site's front page: the pages in every language, each named in its own language. */
export function renderIndex(titles: Record<Language, Record<Page, string>>): string {
  const sections = LANGUAGES.map(
    (lang) =>
      `<li lang="${lang}"><span class="language">${LANGUAGE_NAMES[lang]}</span> ${PAGES.map(
        (page) =>
          `<a href="${pagePath(lang, page)}" hreflang="${lang}">${escapeHtml(titles[lang][page])}</a>`,
      ).join(' · ')}</li>`,
  ).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Konvami</title>
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="styles.css">
</head>
<body>
<header class="masthead">
<span class="brand"><span class="mark" aria-hidden="true">${markSvg({ tile: 'rounded' })}</span>Konvami</span>
</header>
<main>
<ul class="index">
${sections}
</ul>
</main>
</body>
</html>
`;
}
