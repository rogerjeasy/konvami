import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { avatar, size } from '@konvami/design-tokens';
import type { Persona, PersonaLook } from '@konvami/api-client';
import { apiErrorCode, apiErrorKey } from '@/api/messages';
import { Avatar } from '@/components/avatar/avatar';
import { HAIR_STYLES } from '@/components/avatar/look';
import { Button } from '@/components/button';
import { ChoiceChip } from '@/components/choice-chip';
import { LoadState } from '@/components/load-state';
import { Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { HeaderButton } from '@/components/step-header';
import { StepLayout } from '@/components/step-layout';
import { Swatch } from '@/components/swatch';
import { Switch } from '@/components/switch';
import { Text } from '@/components/text';
import { TextField } from '@/components/text-field';
import { commitFeedback, stepFeedback } from '@/lib/haptics';
import { staggerDelay } from '@/lib/motion';
import { backOr } from '@/lib/navigation';
import { ROUTES } from '@/lib/routes';
import { StageGate } from '@/onboarding/gate';
import { useOnboardingStore } from '@/onboarding/services';
import type { OnboardingData } from '@/onboarding/store';
import { usePartners } from '@/onboarding/use-partners';

// The longest name the server takes (services/api: NAME_MAX).
const NAME_MAX = 40;

const keysOf = <T extends object>(palette: T) => Object.keys(palette) as (keyof T & string)[];
const SKINS = keysOf(avatar.skin);
const HAIR_COLORS = keysOf(avatar.hair);
const TOPS = keysOf(avatar.top);
const BACKDROPS = keysOf(avatar.backdrop);

/**
 * One part of the look: its name and the choices for it, as a group of radio buttons that wraps
 * on narrow windows. Swatches bring their own touch area; `chips` need room between them.
 */
function Part({
  label,
  chips = false,
  children,
}: {
  label: string;
  chips?: boolean;
  children: ReactNode;
}) {
  return (
    <View className="gap-1.5">
      <Text variant="fieldLabel" aria-hidden>
        {label}
      </Text>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={label}
        className={`flex-row flex-wrap ${chips ? 'gap-2 py-1' : 'gap-1'}`}
      >
        {children}
      </View>
    </View>
  );
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View className="min-h-tap flex-row items-center justify-between gap-3">
      <Text variant="label" aria-hidden className="flex-1">
        {label}
      </Text>
      <Switch label={label} value={value} onValueChange={onChange} />
    </View>
  );
}

function Editor({ partner, header }: { partner: Persona; header: ReactNode }) {
  const { t } = useTranslation();
  const store = useOnboardingStore();
  const [name, setName] = useState(partner.name);
  const [look, setLook] = useState<PersonaLook>(partner.look);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const choose = (change: Partial<PersonaLook>) => {
    stepFeedback();
    setLook((current) => ({ ...current, ...change }));
  };

  async function save() {
    commitFeedback();
    setProblem(null);
    setSaving(true);
    try {
      await store.changePartner(partner.id, { name: name.trim(), look });
      router.back();
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
          <Button
            label={t('onboarding.save')}
            disabled={!name.trim()}
            loading={saving}
            onPress={save}
          />
        </>
      }
    >
      <Reveal>
        <View className="items-center gap-4">
          {/* The portrait follows every choice at once, so the learner sees what they are picking. */}
          <Avatar look={look} size={size.avatarXl} />
          <Text variant="title" accessibilityRole="header" className="text-center">
            {t('onboarding.partner.title')}
          </Text>
        </View>
      </Reveal>
      <Reveal delay={staggerDelay(1)}>
        <TextField
          label={t('onboarding.partner.name')}
          value={name}
          onChangeText={setName}
          maxLength={NAME_MAX}
          autoCapitalize="words"
          autoCorrect={false}
        />
      </Reveal>
      <Reveal delay={staggerDelay(2)}>
        <View className="gap-4">
          <Part label={t('onboarding.partner.skin')}>
            {SKINS.map((skin) => (
              <Swatch
                key={skin}
                label={t(`onboarding.partner.skins.${skin}`)}
                color={avatar.skin[skin].base}
                selected={look.skin === skin}
                onPress={() => choose({ skin })}
              />
            ))}
          </Part>
          <Part chips label={t('onboarding.partner.hair')}>
            {HAIR_STYLES.map((hair) => (
              <ChoiceChip
                key={hair}
                label={t(`onboarding.partner.hairs.${hair}`)}
                selected={look.hair === hair}
                onPress={() => choose({ hair })}
              />
            ))}
          </Part>
          <Part label={t('onboarding.partner.hairColor')}>
            {HAIR_COLORS.map((hairColor) => (
              <Swatch
                key={hairColor}
                label={t(`onboarding.partner.hairColors.${hairColor}`)}
                color={avatar.hair[hairColor]}
                selected={look.hairColor === hairColor}
                onPress={() => choose({ hairColor })}
              />
            ))}
          </Part>
          <Part label={t('onboarding.partner.top')}>
            {TOPS.map((top) => (
              <Swatch
                key={top}
                label={t(`onboarding.partner.tops.${top}`)}
                color={avatar.top[top]}
                selected={look.top === top}
                onPress={() => choose({ top })}
              />
            ))}
          </Part>
          <Part label={t('onboarding.partner.backdrop')}>
            {BACKDROPS.map((backdrop) => (
              <Swatch
                key={backdrop}
                label={t(`onboarding.partner.backdrops.${backdrop}`)}
                color={avatar.backdrop[backdrop]}
                selected={look.backdrop === backdrop}
                onPress={() => choose({ backdrop })}
              />
            ))}
          </Part>
          <View>
            <Toggle
              label={t('onboarding.partner.glasses')}
              value={look.glasses}
              onChange={(glasses) => setLook((current) => ({ ...current, glasses }))}
            />
            <Toggle
              label={t('onboarding.partner.beard')}
              value={look.beard}
              onChange={(beard) => setLook((current) => ({ ...current, beard }))}
            />
          </View>
        </View>
      </Reveal>
    </StepLayout>
  );
}

function Loaded({ data, header }: { data: OnboardingData; header: ReactNode }) {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id?: string }>();
  // Opened directly (a reload on the web): the partners are not in the store yet.
  const { failure, retry } = usePartners('propose');
  const { partners } = data;

  if (!partners) {
    return (
      <StepLayout header={header}>
        <LoadState
          failed={failure !== null}
          loadingLabel={t('onboarding.partners.loading')}
          slowLabel={t('onboarding.partners.loadingSlow')}
          failedLabel={t(
            failure === 'network' ? 'errors.network' : 'onboarding.partners.loadFailed',
          )}
          retryLabel={t('onboarding.retry')}
          onRetry={retry}
        />
      </StepLayout>
    );
  }
  const partner = partners.find((candidate) => candidate.id === id);
  if (!partner) return <Redirect href={ROUTES.onboardingPartners} />;
  return <Editor partner={partner} header={header} />;
}

/**
 * 4.7 Edit a starter partner: their name and their look, drawn live from the same parts the
 * server stores (spec §6.20). The rest of a persona is edited in Persona Studio later (§6.2).
 */
export function PartnerEditScreen() {
  const { t } = useTranslation();
  const header = (
    <View className="min-h-tap flex-row items-center">
      <HeaderButton
        icon="chevronLeft"
        label={t('common.back')}
        onPress={() => backOr(ROUTES.onboardingPartners)}
      />
    </View>
  );
  return (
    <StageGate allowed={(status) => status.stage === 'partners'} header={header}>
      {(data) => <Loaded data={data} header={header} />}
    </StageGate>
  );
}
