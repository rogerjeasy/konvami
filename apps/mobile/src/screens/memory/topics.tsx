import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { NoticeBox } from '@/components/notice-box';
import { RemovableChip } from '@/components/removable-chip';
import { Section } from '@/components/section';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { TextField } from '@/components/text-field';
import { commitFeedback } from '@/lib/haptics';

// As on the server (services/api: domain/profile.py): how many topics a learner can list, and
// how long one may be.
const MAX_TOPICS = 10;
const TOPIC_MAX = 60;

/** A topic as it is compared and stored: without the spaces around and inside it. */
const tidy = (topic: string) => topic.trim().replace(/\s+/g, ' ');

/**
 * The topics the learner wants left alone (spec §6.11, §16.3): each one with the button that
 * takes it off the list, and a field to add one. `onChange` saves the whole list and rejects
 * when it could not; the list on screen is always the saved one.
 */
export function OffLimitsTopics({
  topics,
  onChange,
}: {
  topics: readonly string[];
  onChange: (topics: string[]) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<'duplicate' | 'failed' | null>(null);

  async function save(next: string[], then?: () => void) {
    commitFeedback();
    setProblem(null);
    setSaving(true);
    try {
      await onChange(next);
      then?.();
    } catch {
      setProblem('failed');
    } finally {
      setSaving(false);
    }
  }

  function add() {
    const topic = tidy(draft);
    if (!topic || saving) return;
    if (topics.some((known) => known.toLowerCase() === topic.toLowerCase())) {
      setProblem('duplicate');
      return;
    }
    void save([...topics, topic], () => setDraft(''));
  }

  return (
    <Section title={t('memory.topics.title')} count={topics.length || undefined}>
      <View className="gap-3">
        <Text variant="small" tone="muted">
          {t('memory.topics.body')}
        </Text>
        {topics.length > 0 ? (
          <View className="flex-row flex-wrap gap-2">
            {topics.map((topic) => (
              <RemovableChip
                key={topic}
                label={topic}
                removeLabel={t('memory.topics.remove', { topic })}
                disabled={saving}
                onRemove={() => void save(topics.filter((known) => known !== topic))}
              />
            ))}
          </View>
        ) : null}
        {topics.length < MAX_TOPICS ? (
          <TextField
            label={t('memory.topics.add')}
            placeholder={t('memory.topics.placeholder')}
            value={draft}
            onChangeText={(text) => {
              setDraft(text);
              setProblem(null);
            }}
            maxLength={TOPIC_MAX}
            autoCapitalize="none"
            returnKeyType="done"
            onSubmitEditing={add}
            editable={!saving}
            error={problem === 'duplicate' ? t('memory.topics.duplicate') : undefined}
            trailing={
              <TextButton
                tone="primary"
                label={t('memory.topics.addButton')}
                disabled={saving}
                onPress={add}
              />
            }
          />
        ) : (
          <Text variant="small" tone="subtle">
            {t('memory.topics.full')}
          </Text>
        )}
        {problem === 'failed' ? (
          <NoticeBox icon="alert" tone="danger">
            {t('memory.saveFailed')}
          </NoticeBox>
        ) : null}
      </View>
    </Section>
  );
}
