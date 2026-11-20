import type { TeacherReport, Transcript } from '@konvami/api-client';

/** The words the PDF is written in: the app's language, as the learner reads it. */
export interface TeacherReportLabels {
  heading: string;
  learner: string;
  language: string;
  level: string;
  period: string;
  minutes: string;
  conversations: string;
  mistakes: string;
  said: string;
  better: string;
  grammar: string;
  levels: string;
  evidence: string;
  grammarSkill: string;
  vocabulary: string;
  speaking: string;
  transcripts: string;
  recording: string;
  none: string;
  footer: string;
  /** A kind of mistake by its category id. */
  category: (id: string) => string;
  /** A grammar topic by its id, and its state. */
  topic: (id: string) => string;
  mastery: (state: string) => string;
  /** How a skill compared with the level ("at the level"). */
  fit: (fit: string) => string;
  /** The language learned by its code. */
  languageName: (code: string) => string;
  /** A moment as a date, and a period from…to. */
  date: (iso: string) => string;
}

export interface TeacherReportOptions {
  /** The learner's first name, if they want it on the page. */
  learner: string | null;
  /** The conversations they chose to add word for word. */
  transcripts: readonly Transcript[];
  /** Links to the recordings of those conversations (they work for an hour). */
  recordings: boolean;
  /** Who said a line in a transcript. */
  speaker: (transcript: Transcript, learner: boolean) => string;
}

const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  );

// Plain print styles: the PDF is read on paper or a laptop, in black on white whatever the
// app's theme. These are print values, not the app's design tokens.
const STYLE = `
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: black; margin: 32px;
    font-size: 12pt; line-height: 1.45; }
  h1 { font-size: 20pt; margin: 0 0 4px; }
  h2 { font-size: 14pt; margin: 24px 0 8px; border-bottom: 1px solid lightgray; padding-bottom: 4px; }
  table { border-collapse: collapse; width: 100%; }
  th, td { text-align: left; vertical-align: top; padding: 4px 8px 4px 0; }
  .muted { color: dimgray; }
  .facts td:first-child { color: dimgray; width: 40%; }
  .line { margin: 4px 0; }
  footer { margin-top: 32px; font-size: 9pt; color: dimgray; }
`;

function section(title: string, body: string): string {
  return `<h2>${escape(title)}</h2>${body}`;
}

/**
 * The report for the learner's teacher (6.23) as one HTML page, which the device prints to a
 * PDF. Everything the learner or a model wrote is escaped: a transcript line is text, never
 * markup.
 */
export function teacherReportHtml(
  report: TeacherReport,
  labels: TeacherReportLabels,
  options: TeacherReportOptions,
): string {
  const minutes = Math.round(report.seconds / 60);
  const facts = [
    options.learner ? [labels.learner, options.learner] : null,
    [labels.language, labels.languageName(report.language)],
    [labels.level, report.level],
    [labels.period, `${labels.date(report.since)} – ${labels.date(report.until)}`],
    [labels.minutes, String(minutes)],
    [labels.conversations, String(report.conversations.length)],
  ]
    .filter((row): row is string[] => row !== null)
    .map(
      ([name, value]) => `<tr><td>${escape(name ?? '')}</td><td>${escape(value ?? '')}</td></tr>`,
    )
    .join('');

  const none = `<p class="muted">${escape(labels.none)}</p>`;
  const mistakes = report.mistakes.length
    ? report.mistakes
        .map(
          (kind) =>
            `<p class="line"><strong>${escape(labels.category(kind.category))}</strong> (${kind.count})</p>` +
            kind.examples
              .map(
                (example) =>
                  `<p class="line">${escape(labels.said)}: <em>${escape(example.original)}</em> → ${escape(labels.better)}: <em>${escape(example.corrected)}</em><br><span class="muted">${escape(example.explanation)}</span></p>`,
              )
              .join(''),
        )
        .join('')
    : none;

  const topics = report.topics.length
    ? `<table>${report.topics
        .map(
          (topic) =>
            `<tr><td>${escape(labels.topic(topic.id))}</td><td>${escape(labels.mastery(topic.mastery))}</td><td class="muted">${topic.correct}/${topic.uses}</td></tr>`,
        )
        .join('')}</table>`
    : none;

  const levels = report.levels.length
    ? report.levels
        .map(
          (point) => `<p class="line">${escape(labels.date(point.at))}: ${escape(point.level)}</p>`,
        )
        .join('')
    : none;

  const evidence = report.fits.length
    ? `<table><tr><th></th><th>${escape(labels.grammarSkill)}</th><th>${escape(labels.vocabulary)}</th><th>${escape(labels.speaking)}</th></tr>${report.fits
        .map(
          (fit) =>
            `<tr><td>${escape(labels.date(fit.at))}</td><td>${escape(labels.fit(fit.grammar))}</td><td>${escape(labels.fit(fit.vocabulary))}</td><td>${escape(labels.fit(fit.speaking))}</td></tr>`,
        )
        .join('')}</table>`
    : none;

  const transcripts = options.transcripts
    .map((transcript) => {
      const lines = transcript.turns
        .map((turn) => {
          const learner = turn.speaker === 'learner';
          const said = escape(turn.verbatim ?? turn.text);
          const audio =
            options.recordings && turn.audio?.url
              ? ` <a href="${escape(turn.audio.url)}">${escape(labels.recording)}</a>`
              : '';
          return `<p class="line"><strong>${escape(options.speaker(transcript, learner))}:</strong> ${said}${audio}</p>`;
        })
        .join('');
      return `<h3>${escape(labels.date(transcript.conversation.startedAt))}</h3>${lines}`;
    })
    .join('');

  return `<!doctype html><html><head><meta charset="utf-8"><title>${escape(labels.heading)}</title><style>${STYLE}</style></head><body>
<h1>${escape(labels.heading)}</h1>
<table class="facts">${facts}</table>
${section(labels.mistakes, mistakes)}
${section(labels.grammar, topics)}
${section(labels.levels, levels)}
${section(labels.evidence, evidence)}
${options.transcripts.length ? section(labels.transcripts, transcripts) : ''}
<footer>${escape(labels.footer)}</footer>
</body></html>`;
}
