import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { LevelStep } from '@konvami/api-client';
import { Card } from '@/components/card';
import { LevelBadge } from '@/components/level-badge';
import { Pop } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { Text } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { ROUTES } from '@/lib/routes';

/** Where the learner sets their level themselves (6.3 Learning). */
function ChangeLevel() {
  const { t } = useTranslation();
  return (
    <View className="items-start">
      <TextButton
        tone="primary"
        label={t('report.level.change')}
        onPress={() => router.push(ROUTES.accountLearning)}
      />
    </View>
  );
}

/**
 * The level this conversation moved the learner to (spec §6.9: "It never jumps silently"). A
 * step up is celebrated; a step down is said plainly, never as a failure. Either way the learner
 * can set their level themselves, which always wins.
 */
export function LevelStepNote({ step }: { step: LevelStep }) {
  const { t } = useTranslation();
  if (!step.rose) {
    return (
      <View className="gap-1">
        <NoticeBox icon="info" title={t('report.level.downTitle', { level: step.after })}>
          {t('report.level.downBody')}
        </NoticeBox>
        <ChangeLevel />
      </View>
    );
  }
  return (
    <Pop>
      <Card className="gap-3 p-4">
        <View className="flex-row items-center gap-3.5">
          <LevelBadge level={step.after} />
          <Text variant="heading" accessibilityRole="header" className="flex-1">
            {t('report.level.upTitle', { level: step.after })}
          </Text>
        </View>
        <Text tone="muted">{t('report.level.upBody', { level: step.after })}</Text>
        <ChangeLevel />
      </Card>
    </Pop>
  );
}
