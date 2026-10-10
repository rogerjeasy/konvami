import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import { apiErrorCode, apiErrorKey } from '@/api/messages';
import { useSession } from '@/auth';
import { AnswerCard } from '@/components/answer-card';
import { Button } from '@/components/button';
import { Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { PersonaAvatar } from '@/components/persona-avatar';
import { HeaderButton } from '@/components/step-header';
import { StepLayout } from '@/components/step-layout';
import { Text } from '@/components/text';
import { commitFeedback } from '@/lib/haptics';
import { staggerDelay } from '@/lib/motion';
import { backOr } from '@/lib/navigation';
import { ROUTES } from '@/lib/routes';
import { answerField, useAnswerRows } from '@/onboarding/answers';
import { firstOpenStep } from '@/onboarding/essentials';
import { OnboardingGate } from '@/onboarding/gate';
import { routeForOnboarding, STEP_ROUTES } from '@/onboarding/routing';
import { useOnboardingStore } from '@/onboarding/services';
import type { OnboardingData } from '@/onboarding/store';
import { SETUP } from '@/screens/create-account/sample-content';

function ReviewBody({ data, header }: { data: OnboardingData; header: ReactNode }) {
  const { t } = useTranslation();
  const { user } = useSession();
  const store = useOnboardingStore();
  const rows = useAnswerRows(data);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function confirm() {
    commitFeedback();
    setProblem(null);
    setSaving(true);
    try {
      await store.confirmEssentials();
      const status = store.getState().data?.status;
      router.replace((status && routeForOnboarding(status)) ?? ROUTES.home);
    } catch (error) {
      setProblem(t(apiErrorKey(apiErrorCode(error))));
    } finally {
      setSaving(false);
    }
  }

  return (
    <StepLayout
      header={header}
      actions={
        <>
          {problem ? (
            <View className="pb-2">
              <NoticeBox icon="alert" tone="danger">
                {problem}
              </NoticeBox>
            </View>
          ) : null}
          <Button label={t('onboarding.review.confirm')} loading={saving} onPress={confirm} />
        </>
      }
    >
      <Reveal>
        <View className="gap-3.5">
          <PersonaAvatar look={SETUP.guide.look} diameter={size.avatarMd} />
          <View className="gap-2.5">
            <Text variant="title" accessibilityRole="header">
              {user?.firstName
                ? t('onboarding.review.title', { name: user.firstName })
                : t('onboarding.review.titleNoName')}
            </Text>
            <Text tone="muted">{t('onboarding.review.body')}</Text>
          </View>
        </View>
      </Reveal>
      <View className="gap-2.5">
        {rows.map((row, i) => (
          <Reveal key={row.step} delay={staggerDelay(i + 1)}>
            <AnswerCard
              icon={row.icon}
              title={t(`onboarding.review.items.${row.step}`)}
              value={row.value}
              details={row.details}
              source={t(`onboarding.source.${answerField(data, row.field)?.source ?? 'asked'}`)}
              editLabel={t('onboarding.review.edit', {
                item: t(`onboarding.review.items.${row.step}`),
              })}
              onPress={() =>
                router.push({ pathname: STEP_ROUTES[row.step], params: { from: 'review' } })
              }
            />
          </Reveal>
        ))}
      </View>
    </StepLayout>
  );
}

/**
 * 4.3 Review: every essential answer read back in words, each one editable, before onboarding
 * moves on (spec §6.1.3: the learner can always see and change what the app was told).
 */
export function ReviewScreen() {
  const { t } = useTranslation();
  const header = (
    <View className="min-h-tap flex-row items-center">
      <HeaderButton
        icon="chevronLeft"
        label={t('common.back')}
        onPress={() => backOr(STEP_ROUTES.course)}
      />
    </View>
  );
  return (
    <OnboardingGate header={header}>
      {(data) => {
        const open = firstOpenStep(data.status.missing);
        // A question without an answer comes before the review, wherever the learner came from.
        if (open) return <Redirect href={STEP_ROUTES[open]} />;
        return <ReviewBody data={data} header={header} />;
      }}
    </OnboardingGate>
  );
}
