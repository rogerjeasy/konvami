import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import { Avatar } from '@/components/avatar/avatar';
import { Badge } from '@/components/badge';
import { Card } from '@/components/card';
import { Pop, Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { Text } from '@/components/text';
import { staggerDelay } from '@/lib/motion';
import { AGE_MAX, AGE_MIN } from '@/profile/persona-draft';
import type { SectionProps } from './shared';
import { voiceName } from './voice';

/** The partner as they will be added: who they are, how they sound and how they correct. */
export function ReviewSection({ draft, problems }: SectionProps) {
  const { t } = useTranslation();
  return (
    <>
      <View className="items-center gap-4">
        <Pop>
          <Avatar look={draft.look} size={size.avatarXl} />
        </Pop>
        <Reveal delay={staggerDelay(1)}>
          <View className="items-center gap-2">
            <Text variant="title" accessibilityRole="header" className="text-center">
              {t('partners.studio.review.title', { name: draft.name.trim() })}
            </Text>
            <Text tone="muted" className="text-center">
              {t('partners.studio.review.body')}
            </Text>
          </View>
        </Reveal>
      </View>
      <Reveal delay={staggerDelay(2)}>
        <Card className="gap-2.5 p-4">
          <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
            <Badge label={t(`onboarding.partners.roles.${draft.role}`)} />
            <Text variant="labelSmall">
              {t('onboarding.partners.ageOrigin', { age: draft.age, origin: draft.origin.trim() })}
            </Text>
          </View>
          {draft.occupation.trim() ? (
            <Text variant="callout" tone="muted">
              {draft.occupation.trim()}
            </Text>
          ) : null}
          {draft.tagline?.trim() ? <Text variant="callout">{draft.tagline.trim()}</Text> : null}
          <Text variant="small" tone="muted">
            {draft.backstory.trim()}
          </Text>
          <View className="gap-1 border-t border-border pt-2.5">
            <Text variant="small" tone="subtle">
              {t('partners.studio.review.voice', { voice: voiceName(draft.voice) })}
            </Text>
            <Text variant="small" tone="subtle">
              {t('partners.studio.review.corrects', {
                timing: t(
                  `partners.studio.teaching.timings.${draft.teaching.correctionTiming}.label`,
                ),
              })}
            </Text>
          </View>
        </Card>
      </Reveal>
      {problems.length ? (
        <NoticeBox icon="alert" tone="danger">
          {problems
            .map((problem) =>
              t(`partners.studio.missing.${problem}`, { min: AGE_MIN, max: AGE_MAX }),
            )
            .join(' ')}
        </NoticeBox>
      ) : null}
    </>
  );
}
