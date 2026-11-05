import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { size } from '@konvami/design-tokens';
import type { Persona, PersonaLook } from '@konvami/api-client';
import { apiErrorCode, apiErrorKey } from '@/api/messages';
import { useSession } from '@/auth';
import { Avatar } from '@/components/avatar/avatar';
import { EXPRESSIONS, type AvatarExpression } from '@/components/avatar/look';
import { usePreviewSpeech } from '@/components/avatar/use-preview-speech';
import { Button } from '@/components/button';
import { ChoiceChip } from '@/components/choice-chip';
import { ChoiceGroup, ToggleRow } from '@/components/choice-group';
import { LoadState } from '@/components/load-state';
import { LookEditor } from '@/components/look-editor';
import { Pop, Reveal } from '@/components/motion';
import { NoticeBox } from '@/components/notice-box';
import { Pill } from '@/components/pill';
import { Text } from '@/components/text';
import { commitFeedback, stepFeedback, successFeedback } from '@/lib/haptics';
import { staggerDelay } from '@/lib/motion';
import { ROUTES } from '@/lib/routes';
import { usePartnerList, useProfileServices } from '@/profile/services';
import { ProfilePage } from '@/screens/profile/page';

/**
 * The portrait and what the learner can do to it: try an expression, make it speak, and change
 * every part, each choice drawn at once. The look is saved on its own ("Save look"), apart from
 * the rest of the partner, which Persona Studio saves.
 */
function AvatarEditor({ partner }: { partner: Persona }) {
  const { t } = useTranslation();
  const { partners } = useProfileServices();
  /** The look as last saved, to tell whether anything was changed. */
  const [saved, setSaved] = useState<PersonaLook>(partner.look);
  const [look, setLook] = useState<PersonaLook>(saved);
  const [expression, setExpression] = useState<AvatarExpression>('neutral');
  const [thumbsUp, setThumbsUp] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const { mouth, viseme } = usePreviewSpeech(speaking);

  const changed = JSON.stringify(look) !== JSON.stringify(saved);

  async function save() {
    commitFeedback();
    setProblem(null);
    setSaving(true);
    try {
      const changedPartner = await partners.change(partner.id, { look });
      setSaved(changedPartner.look);
      setJustSaved(true);
      successFeedback();
    } catch (error) {
      setProblem(t(apiErrorKey(apiErrorCode(error))));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ProfilePage
      title={t('partners.avatar.title', { name: partner.name })}
      body={t('partners.avatar.body')}
      backTo={ROUTES.accountPartners}
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
            label={t('partners.avatar.save')}
            disabled={!changed}
            loading={saving}
            onPress={save}
          />
        </>
      }
    >
      <View className="gap-6">
        <Reveal delay={staggerDelay(1)}>
          <View className="items-center gap-3">
            <Avatar
              look={look}
              size={size.avatarEditor}
              mood={speaking ? 'speaking' : 'idle'}
              mouth={mouth}
              viseme={viseme}
              expression={expression}
              gesture={thumbsUp ? 'thumbsUp' : 'none'}
            />
            {justSaved && !changed ? (
              <View accessibilityLiveRegion="polite">
                <Pop>
                  <Pill tone="success" label={t('partners.avatar.saved')} />
                </Pop>
              </View>
            ) : null}
          </View>
        </Reveal>
        <Reveal delay={staggerDelay(2)}>
          <View className="gap-4">
            <Text variant="title" accessibilityRole="header">
              {t('partners.avatar.preview')}
            </Text>
            <ChoiceGroup chips label={t('partners.avatar.expression')}>
              {EXPRESSIONS.map((name) => (
                <ChoiceChip
                  key={name}
                  label={t(`partners.avatar.expressions.${name}`)}
                  selected={expression === name}
                  onPress={() => {
                    stepFeedback();
                    setExpression(name);
                  }}
                />
              ))}
            </ChoiceGroup>
            <ToggleRow
              label={t('partners.avatar.thumbsUp')}
              value={thumbsUp}
              onChange={setThumbsUp}
            />
            <Button
              variant="secondary"
              label={t(speaking ? 'partners.avatar.stopSpeaking' : 'partners.avatar.speak')}
              onPress={() => {
                stepFeedback();
                setSpeaking((current) => !current);
              }}
            />
          </View>
        </Reveal>
        <Reveal delay={staggerDelay(3)}>
          <LookEditor
            look={look}
            onChange={(next) => {
              setLook(next);
              setJustSaved(false);
              setProblem(null);
            }}
          />
        </Reveal>
      </View>
    </ProfilePage>
  );
}

/** 6.16 The avatar editor for one of the learner's partners (spec §6.20.1, §6.2). */
export function AvatarEditorScreen() {
  const { t } = useTranslation();
  const { status } = useSession();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { partners: store } = useProfileServices();
  const state = usePartnerList();
  const signedIn = status === 'signedIn';

  useEffect(() => {
    if (signedIn) void store.load();
  }, [signedIn, store]);

  if (!signedIn) return <ProfilePage title="" />;

  const title = t('partners.studio.steps.look');
  if (state.phase !== 'ready') {
    return (
      <ProfilePage title={title} backTo={ROUTES.accountPartners}>
        <LoadState
          failed={state.phase === 'failed'}
          loadingLabel={t('onboarding.partners.loading')}
          slowLabel={t('common.wakingUp')}
          failedLabel={t(
            state.error === 'network' ? 'errors.network' : 'onboarding.partners.loadFailed',
          )}
          retryLabel={t('common.retry')}
          onRetry={() => void store.reload()}
        />
      </ProfilePage>
    );
  }

  const partner = state.partners.find((candidate) => candidate.id === id);
  if (!partner) {
    return (
      <ProfilePage title={title} backTo={ROUTES.accountPartners}>
        <NoticeBox icon="info">{t('partners.avatar.notFound')}</NoticeBox>
      </ProfilePage>
    );
  }
  // Keyed by the partner: another partner is another editor, with nothing carried over.
  return <AvatarEditor key={partner.id} partner={partner} />;
}
