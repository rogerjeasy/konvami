import { useTranslation } from 'react-i18next';
import type {
  CoachEvidence,
  CoachFinding,
  CoachSuggestion,
  GrammarMastery,
} from '@konvami/api-client';
import { useTopicLabels } from '@/hooks/use-labels';
import { formatList } from '@/lib/format';

/** The Coach's words for one suggestion: a title, and why with its evidence. */
export interface CoachWords {
  title: string;
  why: string;
}

const MASTERY: readonly GrammarMastery[] = [
  'not_started',
  'introduced',
  'practising',
  'mostly_correct',
  'mastered',
];

/**
 * How the app words what the Coach found, in the interface language: the model's words when it
 * wrote them (in the explanation language), else the app's own, filled in from the evidence.
 * Every number shown comes from the evidence; nothing is made up here either.
 */
export function useCoachWords() {
  const { t, i18n } = useTranslation();
  const topics = useTopicLabels();

  /** The values a template reads, named as the strings name them. */
  function values(evidence: CoachEvidence) {
    const category = evidence.category
      ? t(`report.category.${evidence.category}` as 'report.category.other', {
          defaultValue: t('report.category.other'),
        })
      : '';
    const now =
      evidence.now && MASTERY.includes(evidence.now as GrammarMastery)
        ? topics.mastery(evidence.now as GrammarMastery)
        : (evidence.now ?? '');
    return {
      topic: evidence.topic ? topics.name(evidence.topic) : '',
      category,
      said: evidence.said ?? '',
      corrected: evidence.corrected ?? '',
      conversations: evidence.conversations ?? 0,
      outOf: evidence.outOf ?? 0,
      accuracy: evidence.accuracy ?? 0,
      uses: evidence.uses ?? 0,
      due: evidence.due ?? 0,
      words: formatList(i18n.language, evidence.words ?? []),
      sound: evidence.title ?? evidence.sound ?? '',
      right: evidence.right ?? 0,
      tries: evidence.tries ?? 0,
      score: evidence.score ?? 0,
      name: evidence.name ?? '',
      title: evidence.title ?? '',
      level: evidence.level ?? '',
      next: evidence.next ?? '',
      needed: evidence.needed ?? 0,
      share: evidence.share ?? 0,
      before: evidence.before ?? 0,
      after: evidence.after ?? 0,
      now,
    };
  }

  function template(suggestion: CoachSuggestion): CoachWords {
    const evidence = suggestion.evidence;
    const v = values(evidence);
    switch (suggestion.kind) {
      case 'recurring_mistake':
        return {
          title: evidence.topic
            ? t('coach.kind.recurring_mistake.title', v)
            : t('coach.kind.recurring_mistake.titleNoTopic', v),
          why: t('coach.kind.recurring_mistake.why', v),
        };
      case 'say_it_better':
        return {
          title: t('coach.kind.say_it_better.title'),
          why: t('coach.kind.say_it_better.why', { count: evidence.count ?? 0 }),
        };
      case 'weak_topic':
        return {
          title: t('coach.kind.weak_topic.title', v),
          why: t('coach.kind.weak_topic.why', v),
        };
      case 'cards_overdue':
        return {
          title: t('coach.kind.cards_overdue.title', { count: evidence.count ?? 0 }),
          why: t('coach.kind.cards_overdue.why', { ...v, count: evidence.days ?? 0 }),
        };
      case 'cards_lapsing':
        return {
          title: t('coach.kind.cards_lapsing.title'),
          why: t('coach.kind.cards_lapsing.why', v),
        };
      case 'review_due':
        return {
          title: t('coach.kind.review_due.title', { count: evidence.count ?? 0 }),
          why: t('coach.kind.review_due.why'),
        };
      case 'problem_sound':
        return {
          title: t('coach.kind.problem_sound.title', v),
          why:
            evidence.score != null
              ? t('coach.kind.problem_sound.whyScore', v)
              : t('coach.kind.problem_sound.why', v),
        };
      case 'exam_near':
        return {
          title: t('coach.kind.exam_near.title', v),
          why:
            evidence.days != null
              ? t('coach.kind.exam_near.why', { count: evidence.days })
              : t('coach.kind.exam_near.whyNoDate'),
        };
      case 'level_close':
        return {
          title: t('coach.kind.level_close.title', v),
          why: t('coach.kind.level_close.why', { ...v, count: evidence.count ?? 0 }),
        };
      case 'long_gap':
        return {
          title: t('coach.kind.long_gap.title'),
          why: t('coach.kind.long_gap.why', { count: evidence.days ?? 0 }),
        };
      case 'streak_at_risk':
        return {
          title: t('coach.kind.streak_at_risk.title', { count: evidence.days ?? 0 }),
          why: t('coach.kind.streak_at_risk.why'),
        };
      case 'partner_unvisited':
        return {
          title: t('coach.kind.partner_unvisited.title', v),
          why:
            evidence.days != null
              ? t('coach.kind.partner_unvisited.why', { count: evidence.days })
              : t('coach.kind.partner_unvisited.whyNever', v),
        };
      case 'import_waiting':
        return {
          title: t('coach.kind.import_waiting.title', v),
          why: t('coach.kind.import_waiting.why'),
        };
      default:
        // A kind this version of the app does not know: only the model's words can show it.
        return { title: '', why: '' };
    }
  }

  return {
    /** The suggestion's title and why. */
    words(suggestion: CoachSuggestion): CoachWords {
      const own = template(suggestion);
      return { title: suggestion.title ?? own.title, why: suggestion.why ?? own.why };
    },
    /** One line for something that holds the learner back or went well; "" for an unknown kind. */
    finding(finding: CoachFinding): string {
      const evidence = finding.evidence;
      const v = values(evidence);
      const days = { ...v, count: evidence.days ?? 0 };
      switch (finding.kind) {
        case 'recurring_mistake':
          return t('coach.finding.recurring_mistake', v);
        case 'say_it_better':
          return t('coach.finding.say_it_better');
        case 'weak_topic':
          return t('coach.finding.weak_topic', v);
        case 'cards_overdue':
          return t('coach.finding.cards_overdue', v);
        case 'cards_lapsing':
          return t('coach.finding.cards_lapsing', v);
        case 'review_due':
          return t('coach.finding.review_due', { count: evidence.count ?? 0 });
        case 'problem_sound':
          return t('coach.finding.problem_sound', v);
        case 'exam_near':
          return t('coach.finding.exam_near', v);
        case 'level_close':
          return t('coach.finding.level_close', v);
        case 'long_gap':
          return t('coach.finding.long_gap');
        case 'streak_at_risk':
          return t('coach.finding.streak_at_risk');
        case 'partner_unvisited':
          return t('coach.finding.partner_unvisited', v);
        case 'import_waiting':
          return t('coach.finding.import_waiting', v);
        case 'plan_missed':
          return t('coach.finding.plan_missed', days);
        case 'topic_improved':
          return t('coach.finding.topic_improved', v);
        case 'fewer_mistakes':
          return t('coach.finding.fewer_mistakes', { ...v, count: evidence.count ?? 0 });
        case 'pace_up':
          return t('coach.finding.pace_up', v);
        case 'level_up':
          return t('coach.finding.level_up', v);
        case 'streak_best':
          return t('coach.finding.streak_best', days);
        case 'cards_remembered':
          return t('coach.finding.cards_remembered', { ...v, count: evidence.count ?? 0 });
        default:
          return '';
      }
    },
  };
}
