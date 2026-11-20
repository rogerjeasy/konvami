import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { CoachAction, CoachFeedback, CoachSuggestion } from '@konvami/api-client';
import { Badge } from '@/components/badge';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import type { IconName } from '@/components/icon';
import { IconBlob } from '@/components/list';
import { NoticeBox } from '@/components/notice-box';
import { Sheet } from '@/components/sheet';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { coachRoute } from '@/lib/coach';
import { commitFeedback } from '@/lib/haptics';
import { usePracticeServices } from '@/practice/services';
import { useCoachWords } from './words';

/** What each action looks like beside its title. */
type CoachReason = NonNullable<CoachFeedback['reason']>;

const ACTION_ICON: Record<CoachAction['type'], IconName> = {
  lesson: 'book',
  say_it_better: 'mic',
  review_cards: 'archive',
  review_conversation: 'message',
  sound_drill: 'volume',
  exam: 'award',
  free_talk: 'message',
  call_partner: 'users',
  import_call: 'file',
};

const REASONS: readonly CoachReason[] = [
  'not_interested',
  'already_know',
  'too_long',
  'not_useful',
];

/** Why the learner turns a suggestion down: what the Coach learns from. */
function ReasonSheet({
  visible,
  onPick,
  onClose,
}: {
  visible: boolean;
  onPick: (reason: CoachReason) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Sheet visible={visible} icon="compass" title={t('coach.reasons.title')} onClose={onClose}>
      <View className="gap-3">
        <Text tone="muted">{t('coach.reasons.body')}</Text>
        {REASONS.map((reason) => (
          <Button
            key={reason}
            variant="secondary"
            label={t(`coach.reasons.${reason}`)}
            onPress={() => onPick(reason)}
          />
        ))}
        <TextButton label={t('coach.reasons.cancel')} onPress={onClose} />
      </View>
    </Sheet>
  );
}

/**
 * One of the Coach's suggestions (5.1, 5.26): what to do, why with its evidence, how long, and
 * three answers: start it, not now (back tomorrow), not for me (with a reason the Coach learns
 * from). `main` makes "Start" the screen's main action: when the Coach comes before the plan.
 */
export function SuggestionCard({
  suggestion,
  main = false,
}: {
  suggestion: CoachSuggestion;
  main?: boolean;
}) {
  const { t } = useTranslation();
  const { answerCoach } = usePracticeServices();
  const { words } = useCoachWords();
  const [asking, setAsking] = useState(false);
  const [failed, setFailed] = useState(false);
  const [noted, setNoted] = useState(false);
  const { title, why } = words(suggestion);
  const route = coachRoute(suggestion.action);
  const started = suggestion.status === 'accepted';

  async function answer(feedback: Parameters<typeof answerCoach>[1]) {
    setFailed(false);
    try {
      await answerCoach(suggestion.id, feedback);
      return true;
    } catch {
      setFailed(true);
      return false;
    }
  }

  function start() {
    if (!route) return;
    commitFeedback();
    // The answer is noted on the way; the action does not wait for it.
    if (!started) void answer({ response: 'accepted' });
    router.push(route);
  }

  if (!title) return null;
  return (
    <Card className="gap-3 p-4">
      <View className="flex-row items-start gap-3">
        <IconBlob icon={ACTION_ICON[suggestion.action.type] ?? 'compass'} />
        <View className="flex-1 gap-1.5">
          <Text variant="label">{title}</Text>
          {why ? (
            <Text variant="small" tone="muted">
              {why}
            </Text>
          ) : null}
          <View className="flex-row flex-wrap gap-2 pt-0.5">
            <Badge tone="chip" label={t('coach.minutes', { count: suggestion.minutes })} />
            {suggestion.urgent && !started ? (
              <Badge tone="primary" label={t('coach.urgent')} />
            ) : null}
            {started ? <Badge tone="primary" label={t('coach.started')} /> : null}
          </View>
        </View>
      </View>
      {route ? (
        <Button
          variant={main ? 'primary' : 'secondary'}
          label={t('coach.start')}
          accessibilityHint={title}
          onPress={start}
        />
      ) : (
        <Text variant="small" tone="muted">
          {t('coach.unavailable')}
        </Text>
      )}
      {started ? null : (
        <View className="flex-row flex-wrap justify-center gap-x-6">
          <TextButton
            label={t('coach.notNow')}
            accessibilityHint={title}
            onPress={() => void answer({ response: 'snoozed' })}
          />
          <TextButton
            label={t('coach.notForMe')}
            accessibilityHint={title}
            onPress={() => setAsking(true)}
          />
        </View>
      )}
      {failed ? (
        <NoticeBox icon="info" tone="warn">
          {t('coach.answerFailed')}
        </NoticeBox>
      ) : null}
      {noted ? <NoticeBox icon="check">{t('coach.noted')}</NoticeBox> : null}
      <ReasonSheet
        visible={asking}
        onClose={() => setAsking(false)}
        onPick={(reason) => {
          setAsking(false);
          setNoted(true);
          void answer({ response: 'dismissed', reason });
        }}
      />
    </Card>
  );
}
