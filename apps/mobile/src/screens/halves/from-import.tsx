import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { apiErrorCode } from '@/api/messages';
import { useSession } from '@/auth';
import { Button } from '@/components/button';
import { LoadState } from '@/components/load-state';
import { Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { OptionCard } from '@/components/option-card';
import { PageHero } from '@/components/page-hero';
import { HeaderButton } from '@/components/step-header';
import { StepLayout } from '@/components/step-layout';
import { Text } from '@/components/text';
import { useHalvesApi } from '@/halves/services';
import { commitFeedback, successFeedback } from '@/lib/haptics';
import { staggerDelay } from '@/lib/motion';
import { backOr } from '@/lib/navigation';
import { halvesCaseRoute, ROUTES } from '@/lib/routes';
import { useImports, usePracticeServices } from '@/practice/services';

const FAILURES = ['too_few_words', 'limit', 'not_found'] as const;

function failureOf(code: string) {
  const known = FAILURES.find((one) => one === code) ?? 'unavailable';
  return `halves.fromImport.failed.${known}` as const;
}

/**
 * 7.17 A case from the learner's course: they pick something they imported (5.23), the Case
 * Writer turns its words into a mystery (or code makes a word case from them) and an AI plays
 * the other half. The learner's own material becomes something to say out loud.
 */
export function HalvesFromImportScreen() {
  const { t } = useTranslation();
  const { status } = useSession();
  const signedIn = status === 'signedIn';
  const api = useHalvesApi();
  const { imports: store } = usePracticeServices();
  const state = useImports();
  const [picked, setPicked] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    if (signedIn) void store.load();
  }, [signedIn, store]);

  async function write() {
    if (!picked) return;
    commitFeedback();
    setWorking(true);
    setFailure(null);
    try {
      const made = await api.startHalvesImportCase(picked);
      successFeedback();
      router.replace(halvesCaseRoute(made.id));
    } catch (error) {
      setFailure(t(failureOf(apiErrorCode(error))));
    } finally {
      setWorking(false);
    }
  }

  if (!signedIn) return <Redirect href={ROUTES.welcome} />;
  const items = state.phase === 'ready' ? state.data.imports : null;
  return (
    <StepLayout
      header={
        <View className="min-h-tap flex-row items-center">
          <HeaderButton
            icon="chevronLeft"
            label={t('common.back')}
            onPress={() => backOr(ROUTES.halves)}
          />
        </View>
      }
      actions={
        items && items.length > 0 ? (
          <Button
            label={working ? t('halves.fromImport.working') : t('halves.start')}
            loading={working}
            disabled={!picked || working}
            onPress={() => void write()}
          />
        ) : items ? (
          <Button label={t('halves.fromImport.bring')} onPress={() => router.push(ROUTES.import)} />
        ) : undefined
      }
    >
      <Reveal>
        <PageHero
          color="tomato"
          icon="book"
          title={t('halves.fromImport.title')}
          body={t('halves.fromImport.body')}
        />
      </Reveal>
      {failure ? (
        <NoticeBox icon="info" tone="warn">
          {failure}
        </NoticeBox>
      ) : null}
      {!items ? (
        <LoadState
          failed={state.phase === 'failed'}
          loadingLabel={t('halves.loading')}
          slowLabel={t('common.wakingUp')}
          failedLabel={t('halves.loadFailed')}
          retryLabel={t('common.retry')}
          onRetry={() => void store.load()}
        />
      ) : items.length === 0 ? (
        <Reveal delay={staggerDelay(1)}>
          <Text tone="muted">{t('halves.fromImport.empty')}</Text>
        </Reveal>
      ) : (
        <View accessibilityRole="radiogroup" className="gap-2.5">
          {items.map((item, index) => (
            <Reveal key={item.id} delay={staggerDelay(1 + index)}>
              <OptionCard
                role="radio"
                label={item.title}
                description={`${item.level} · ${t('halves.fromImport.words', { count: item.words })}`}
                selected={picked === item.id}
                disabled={working}
                onPress={() => setPicked(item.id)}
              />
            </Reveal>
          ))}
        </View>
      )}
    </StepLayout>
  );
}
