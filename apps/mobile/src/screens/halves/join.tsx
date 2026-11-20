import { useState } from 'react';
import { View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { apiErrorCode } from '@/api/messages';
import { useSession } from '@/auth';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ChoiceChip } from '@/components/choice-chip';
import { ChoiceGroup, ToggleRow } from '@/components/choice-group';
import { LoadState } from '@/components/load-state';
import { Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { PageHero } from '@/components/page-hero';
import { HeaderButton } from '@/components/step-header';
import { StepLayout } from '@/components/step-layout';
import { Text } from '@/components/text';
import { useHalvesApi, useHalvesHub } from '@/halves/services';
import { commitFeedback } from '@/lib/haptics';
import { staggerDelay } from '@/lib/motion';
import { backOr } from '@/lib/navigation';
import { ROUTES } from '@/lib/routes';
import { failureKey, useLanguageName } from './parts';

type PlaceKind = 'none' | 'country' | 'city';

/** The place a learner may show: a list to pick from, never anything typed or finer than a city. */
export function PlacePicker({
  cities,
  countries,
  value,
  onChange,
}: {
  cities: string[];
  countries: string[];
  value: string | null;
  onChange: (place: string | null) => void;
}) {
  const { t } = useTranslation();
  const [kind, setKind] = useState<PlaceKind>(
    value?.startsWith('city:') ? 'city' : value?.startsWith('country:') ? 'country' : 'none',
  );
  const options = kind === 'city' ? cities : kind === 'country' ? countries : [];
  return (
    <View className="gap-2.5">
      <ChoiceGroup label={t('halves.joinScreen.place')} chips>
        {(['none', 'country', 'city'] as const).map((one) => (
          <ChoiceChip
            key={one}
            label={
              one === 'none'
                ? t('halves.joinScreen.placeNone')
                : one === 'country'
                  ? t('halves.joinScreen.placeCountry')
                  : t('halves.joinScreen.placeCity')
            }
            selected={kind === one}
            onPress={() => {
              setKind(one);
              if (one === 'none') onChange(null);
            }}
          />
        ))}
      </ChoiceGroup>
      {options.length > 0 ? (
        <ChoiceGroup label={t('halves.settingsScreen.place')} chips>
          {options.map((option) => (
            <ChoiceChip
              key={option}
              label={option}
              selected={value === `${kind}:${option}`}
              onPress={() => onChange(`${kind}:${option}`)}
            />
          ))}
        </ChoiceGroup>
      ) : null}
    </View>
  );
}

/**
 * 7.2 Join Two Halves: a first language, a place from a list (or none), the veil, and the consent
 * to let the other player of a case hear one's moves. Nothing is typed; the codename is made up.
 */
export function HalvesJoinScreen() {
  const { t } = useTranslation();
  const { status } = useSession();
  const signedIn = status === 'signedIn';
  const api = useHalvesApi();
  const languageName = useLanguageName();
  const { state, refresh } = useHalvesHub(signedIn);
  const [native, setNative] = useState<string | null>(null);
  const [place, setPlace] = useState<string | null>(null);
  const [veil, setVeil] = useState(true);
  const [consent, setConsent] = useState(false);
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  async function join() {
    if (!native) return;
    commitFeedback();
    setSending(true);
    setFailure(null);
    try {
      await api.joinHalves({
        nativeLanguage: native,
        place,
        veilDefault: veil,
        voiceConsent: consent,
      });
      router.replace(ROUTES.halves);
    } catch (error) {
      setFailure(t(failureKey(apiErrorCode(error))));
    } finally {
      setSending(false);
    }
  }

  if (!signedIn) return <Redirect href={ROUTES.welcome} />;
  const hub = state.phase === 'ready' ? state.data : null;
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
        hub ? (
          <Button
            label={t('halves.joinScreen.submit')}
            disabled={!native || !consent}
            loading={sending}
            onPress={() => void join()}
          />
        ) : undefined
      }
    >
      <Reveal>
        <PageHero
          color="tomato"
          icon="user"
          title={t('halves.joinScreen.title')}
          body={t('halves.joinScreen.body')}
        />
      </Reveal>
      {!hub ? (
        <LoadState
          failed={state.phase === 'failed'}
          loadingLabel={t('halves.loading')}
          slowLabel={t('common.wakingUp')}
          failedLabel={t('halves.loadFailed')}
          retryLabel={t('common.retry')}
          onRetry={refresh}
        />
      ) : (
        <>
          <Reveal delay={staggerDelay(1)}>
            <ChoiceGroup label={t('halves.joinScreen.native')} chips>
              {hub.nativeLanguages.map((code) => (
                <ChoiceChip
                  key={code}
                  label={code === 'other' ? t('halves.joinScreen.other') : languageName(code)}
                  selected={native === code}
                  onPress={() => setNative(code)}
                />
              ))}
            </ChoiceGroup>
          </Reveal>
          <Reveal delay={staggerDelay(2)}>
            <PlacePicker
              cities={hub.cities}
              countries={hub.countries}
              value={place}
              onChange={setPlace}
            />
          </Reveal>
          <Reveal delay={staggerDelay(3)}>
            <View className="gap-1.5">
              <ToggleRow label={t('halves.joinScreen.veil')} value={veil} onChange={setVeil} />
              <Text variant="small" tone="muted">
                {t('halves.joinScreen.veilHint')}
              </Text>
            </View>
          </Reveal>
          <Reveal delay={staggerDelay(4)}>
            <Card className="gap-2.5 p-4">
              <Text variant="section" accessibilityRole="header">
                {t('halves.joinScreen.consentTitle')}
              </Text>
              <Text variant="small" tone="muted">
                {t('halves.joinScreen.consentHint')}
              </Text>
              <ToggleRow
                label={t('halves.joinScreen.consent')}
                value={consent}
                onChange={setConsent}
              />
            </Card>
          </Reveal>
          {failure ? (
            <NoticeBox icon="info" tone="warn">
              {failure}
            </NoticeBox>
          ) : null}
        </>
      )}
    </StepLayout>
  );
}
