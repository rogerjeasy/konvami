import type { TeacherReport, Transcript } from '@konvami/api-client';
import { teacherReportHtml, type TeacherReportLabels } from './teacher-report';

const REPORT: TeacherReport = {
  language: 'de',
  level: 'A2',
  since: '2026-09-09T12:00:00Z',
  until: '2026-10-09T12:00:00Z',
  seconds: 1800,
  conversations: [
    {
      id: 'rtc_1',
      startedAt: '2026-10-08T18:00:00Z',
      seconds: 600,
      partnerName: 'Lena',
      scenario: null,
    },
  ],
  mistakes: [
    {
      category: 'case',
      count: 3,
      examples: [
        { original: 'mit der Mann', corrected: 'mit dem Mann', explanation: 'Dative <b>' },
      ],
    },
  ],
  topics: [],
  levels: [{ at: '2026-09-01T12:00:00Z', level: 'A2', source: 'asked' }],
  fits: [{ at: '2026-10-08T18:00:00Z', grammar: 'at', vocabulary: 'above', speaking: 'at' }],
};

const LABELS: TeacherReportLabels = {
  heading: 'Report',
  learner: 'Learner',
  language: 'Language',
  level: 'Level',
  period: 'Period',
  minutes: 'Minutes',
  conversations: 'Conversations',
  mistakes: 'Mistakes',
  said: 'Said',
  better: 'Better',
  grammar: 'Grammar',
  levels: 'Levels',
  evidence: 'Evidence',
  grammarSkill: 'Grammar skill',
  vocabulary: 'Vocabulary',
  speaking: 'Speaking',
  transcripts: 'Transcripts',
  recording: 'Recording',
  none: 'None',
  footer: 'Footer',
  category: (id) => `category:${id}`,
  topic: (id) => id,
  mastery: (state) => state,
  fit: (fit) => `fit:${fit}`,
  languageName: (code) => (code === 'de' ? 'German' : code),
  date: (iso) => iso.slice(0, 10),
};

const TRANSCRIPT: Transcript = {
  conversation: {
    id: 'rtc_1',
    partner: null,
    guest: null,
    startedAt: '2026-10-08T18:00:00Z',
    endedAt: '2026-10-08T18:10:00Z',
    seconds: 600,
    learnerTurns: 1,
    scenario: null,
    goalsReached: [],
  },
  turns: [
    {
      speaker: 'learner',
      text: 'Ich bin <script>',
      verbatim: null,
      audio: { url: 'https://files.test/a.wav', milliseconds: 1000 },
      guest: false,
    },
  ],
} as unknown as Transcript;

const speaker = (_: Transcript, learner: boolean) => (learner ? 'Amara' : 'Lena');

describe('the report for the learner’s teacher', () => {
  it('lists the period, the confirmed mistakes and the level evidence', () => {
    const html = teacherReportHtml(REPORT, LABELS, {
      learner: 'Amara',
      transcripts: [],
      recordings: false,
      speaker,
    });

    expect(html).toContain('<td>Language</td><td>German</td>');
    expect(html).toContain('<td>Minutes</td><td>30</td>');
    expect(html).toContain('<strong>category:case</strong> (3)');
    expect(html).toContain('<em>mit dem Mann</em>');
    expect(html).toContain('fit:above');
    expect(html).toContain('<td>Learner</td><td>Amara</td>');
    expect(html).not.toContain('Transcripts');
  });

  it('escapes every text a learner or a model wrote', () => {
    const html = teacherReportHtml(REPORT, LABELS, {
      learner: null,
      transcripts: [TRANSCRIPT],
      recordings: false,
      speaker,
    });

    expect(html).toContain('Dative &lt;b&gt;');
    expect(html).toContain('Ich bin &lt;script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('Learner</td>');
  });

  it('links the recordings only when the learner asks for them', () => {
    const without = teacherReportHtml(REPORT, LABELS, {
      learner: null,
      transcripts: [TRANSCRIPT],
      recordings: false,
      speaker,
    });
    const linked = teacherReportHtml(REPORT, LABELS, {
      learner: null,
      transcripts: [TRANSCRIPT],
      recordings: true,
      speaker,
    });

    expect(without).not.toContain('https://files.test/a.wav');
    expect(linked).toContain('<a href="https://files.test/a.wav">Recording</a>');
  });
});
