import { View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/auth';
import { Card } from '@/components/card';
import { LoadState } from '@/components/load-state';
import { Reveal } from '@/components/motion';
import { PageHero } from '@/components/page-hero';
import { QuestList } from '@/components/quest-list';
import { HeaderButton } from '@/components/step-header';
import { StepLayout } from '@/components/step-layout';
import { Text } from '@/components/text';
import { commitFeedback } from '@/lib/haptics';
import { staggerDelay } from '@/lib/motion';
import { backOr } from '@/lib/navigation';
import { questRoute } from '@/lib/quests';
import { ROUTES } from '@/lib/routes';
import { useMotivation, usePracticeServices, useSuggestedPartner } from '@/practice/services';
import { Celebrations } from './celebrations';

/**
 * 5.27 This week's quests (spec §6.15): three small speaking challenges, chosen once a week from
 * the plan and the learner's own material, ticked from what they did. No points, no ranking;
 * a quest done is celebrated once. The butter block, as the week and the streak are.
 */
export function QuestsScreen() {
  const { t } = useTranslation();
  const { status } = useSession();
  const { motivation: store } = usePracticeServices();
  const motivation = useMotivation();
  const partner = useSuggestedPartner();

  if (status !== 'signedIn') return <Redirect href={ROUTES.welcome} />;
  const header = (
    <View className="min-h-tap flex-row items-center">
      <HeaderButton
        icon="chevronLeft"
        label={t('common.back')}
        onPress={() => backOr(ROUTES.today)}
      />
    </View>
  );
  if (motivation.phase !== 'ready') {
    return (
      <StepLayout header={header}>
        <LoadState
          failed={motivation.phase === 'failed'}
          loadingLabel={t('common.loading')}
          slowLabel={t('common.wakingUp')}
          failedLabel={t('motivation.quests.loadFailed')}
          retryLabel={t('common.retry')}
          onRetry={() => void store.reload()}
        />
      </StepLayout>
    );
  }
  const { quests } = motivation.data.quests;
  const done = quests.filter((quest) => quest.done).length;
  return (
    <StepLayout header={header}>
      <Reveal>
        <PageHero
          color="butter"
          icon="target"
          title={t('motivation.quests.title')}
          body={t('motivation.quests.body')}
        >
          <Text variant="label" tone="onButter">
            {motivation.data.quests.allDone
              ? t('motivation.quests.allDone')
              : t('motivation.quests.summary', { done, total: quests.length })}
          </Text>
        </PageHero>
      </Reveal>
      <Reveal delay={staggerDelay(1)}>
        <Card className="p-4">
          <QuestList
            quests={quests}
            onStart={(quest) => {
              commitFeedback();
              router.push(questRoute(quest.kind, partner));
            }}
          />
        </Card>
      </Reveal>
      <Celebrations />
    </StepLayout>
  );
}
