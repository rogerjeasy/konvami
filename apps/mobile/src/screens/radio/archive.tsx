import { Pressable, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import { useSession } from '@/auth';
import { Badge } from '@/components/badge';
import { Card } from '@/components/card';
import { Icon } from '@/components/icon';
import { LoadState } from '@/components/load-state';
import { Reveal } from '@/components/motion';
import { HeaderButton } from '@/components/step-header';
import { StepLayout } from '@/components/step-layout';
import { Text } from '@/components/text';
import { formatDayOfYear } from '@/lib/format';
import { staggerDelay } from '@/lib/motion';
import { backOr } from '@/lib/navigation';
import { radioEpisodeRoute, ROUTES } from '@/lib/routes';
import { useRadioArchive } from '@/radio/services';
import { useTheme } from '@/theme';
import { StudioHero } from './parts';

// The list's entrance stops staggering after this many rows: a long archive appears at once.
const STAGGER_ROWS = 8;

/** 8.5 Past shows: the last two weeks, newest first, each with its question and who was in it. */
export function RadioArchiveScreen() {
  const { t, i18n } = useTranslation();
  const { color } = useTheme();
  const { status } = useSession();
  const signedIn = status === 'signedIn';
  const { state, refresh } = useRadioArchive(signedIn);

  if (!signedIn) return <Redirect href={ROUTES.welcome} />;
  const shows = state.phase === 'ready' ? state.data : null;
  return (
    <StepLayout
      header={
        <View className="min-h-tap flex-row items-center">
          <HeaderButton
            icon="chevronLeft"
            label={t('common.back')}
            onPress={() => backOr(ROUTES.radio)}
          />
        </View>
      }
    >
      <Reveal>
        <StudioHero title={t('radio.archive.title')} body={t('radio.archive.body')} live={false} />
      </Reveal>
      {!shows ? (
        <LoadState
          failed={state.phase === 'failed'}
          loadingLabel={t('radio.loading')}
          slowLabel={t('common.wakingUp')}
          failedLabel={t('radio.archive.loadFailed')}
          retryLabel={t('common.retry')}
          onRetry={refresh}
        />
      ) : shows.length === 0 ? (
        <Text tone="muted">{t('radio.archive.empty')}</Text>
      ) : (
        <View className="gap-2.5">
          {shows.map((show, index) => (
            <Reveal key={show.id} delay={staggerDelay(Math.min(index, STAGGER_ROWS) + 1)}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${formatDayOfYear(i18n.language, show.day)}, ${show.question}`}
                onPress={() => router.push(radioEpisodeRoute(show.id))}
              >
                <Card className="min-h-tap flex-row items-center gap-3 p-4">
                  <View className="flex-1 gap-1">
                    <View className="flex-row flex-wrap items-center gap-2">
                      <Text variant="caption" tone="subtle">
                        {formatDayOfYear(i18n.language, show.day)}
                      </Text>
                      {show.mine ? <Badge label={t('radio.today.yours')} /> : null}
                    </View>
                    <Text variant="langLine">{show.question}</Text>
                    <Text variant="small" tone="muted">
                      {t('radio.today.callers', { count: show.callers })} ·{' '}
                      {t('radio.today.aiCallers', { count: show.aiCallers })}
                    </Text>
                  </View>
                  <Icon name="play" color={color.primary} size={size.iconMd} />
                </Card>
              </Pressable>
            </Reveal>
          ))}
        </View>
      )}
    </StepLayout>
  );
}
